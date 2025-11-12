// POST /api/review.ts
import shopifyServer from "@/lib/shopify.server.js";
import { NextResponse } from "next/server";

const SHOPIFY_HOST_NAME = process.env.SHOPIFY_HOST_NAME;
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

// Prüfe ob Metaobjekt-Definition existiert
const checkMetaobjectDefinition = async (client) => {
	try {
		const checkQuery = `
			query CheckMetaobjectDefinition {
				metaobjectDefinitions(first: 10, type: "review") {
					edges {
						node {
							id
							type
							name
						}
					}
				}
			}
		`;

		const response = await client.request(checkQuery, {
			retries: 2,
		});

		const metaobjectExists = response.data.metaobjectDefinitions.edges.length > 0;
		const definition = metaobjectExists ? response.data.metaobjectDefinitions.edges[0].node : null;

		return {
			exists: metaobjectExists,
			definition,
		};
	} catch (error) {
		console.error("Error checking metaobject definition:", error);
		return {
			exists: false,
			definition: null,
		};
	}
};

// Erstelle Metaobjekt-Definition falls nicht vorhanden
const createMetaobjectDefinition = async (client) => {
	try {
		const createMutation = `
			mutation CreateMetaobjectDefinition {
				metaobjectDefinitionCreate(definition: {
					name: "Review",
					type: "review",
					fieldDefinitions: [
						{
							key: "name",
							name: "Name",
							type: "single_line_text_field"
						},
						{
							key: "rating",
							name: "Bewertung",
							type: "number_integer",
							validations: [{name: "min", value: "1"}, {name: "max", value: "5"}]
						},
						{
							key: "kommentar",
							name: "Kommentar",
							type: "multi_line_text_field"
						},
						{
							key: "produkt",
							name: "Produkt",
							type: "product_reference"
						},
						{
							key: "published",
							name: "Veröffentlicht",
							type: "boolean"
						},
						{
							key: "verifizierter_kaeufer",
							name: "Verifizierter Käufer",
							type: "boolean"
						},
						{
							key: "datum",
							name: "Datum",
							type: "date"
						}
					]
				}) {
					metaobjectDefinition {
						id
						type
					}
					userErrors {
						field
						message
					}
				}
			}
		`;

		const response = await client.request(createMutation, {
			retries: 2,
		});

		const result = response.data.metaobjectDefinitionCreate;
		const success = result?.metaobjectDefinition?.id && result.userErrors.length === 0;

		return {
			success,
			definition: result?.metaobjectDefinition || null,
			errors: result.userErrors || [],
		};
	} catch (error) {
		console.error("Error creating metaobject definition:", error);
		return {
			success: false,
			definition: null,
			errors: [{ message: error.message }],
		};
	}
};

// Prüfe ob Shop-Metafeld für Review-Liste existiert
const checkShopMetafieldDefinition = async (client) => {
	try {
		const checkQuery = `
			query CheckShopMetafield {
				metafieldDefinitions(first: 10, namespace: "custom", key: "bewertungen", ownerType: SHOP) {
					edges {
						node {
							id
							name
						}
					}
				}
			}
		`;

		const response = await client.request(checkQuery, {
			retries: 2,
		});

		const exists = response.data.metafieldDefinitions.edges.length > 0;

		return { exists };
	} catch (error) {
		console.error("Error checking shop metafield definition:", error);
		return { exists: false };
	}
};

// Erstelle Shop-Metafeld-Definition für Review-Liste
const createShopMetafieldDefinition = async (client) => {
	try {
		const createMutation = `
			mutation CreateShopMetafieldDefinition {
				metafieldDefinitionCreate(definition: {
					name: "Bewertungen",
					namespace: "custom",
					key: "bewertungen",
					type: "list.metaobject_reference",
					ownerType: SHOP
				}) {
					createdDefinition {
						id
					}
					userErrors {
						field
						message
					}
				}
			}
		`;

		const response = await client.request(createMutation, {
			retries: 2,
		});

		const result = response.data.metafieldDefinitionCreate;
		const success = result?.createdDefinition?.id && result.userErrors.length === 0;

		return {
			success,
			errors: result.userErrors || [],
		};
	} catch (error) {
		console.error("Error creating shop metafield definition:", error);
		return {
			success: false,
			errors: [{ message: error.message }],
		};
	}
};

export async function POST(request) {
	try {
		if (!SHOPIFY_HOST_NAME || !SHOPIFY_ADMIN_ACCESS_TOKEN) {
			return NextResponse.json({ error: "Missing Shopify credentials" }, { status: 500 });
		}

		const body = await request.json();
		const { product_id, name, rating, comment } = body;
		
		if (!product_id || !name || !rating || !comment) {
			return NextResponse.json({ error: "Missing fields" }, { status: 400 });
		}

		const adminSession = {
			shop: SHOPIFY_HOST_NAME,
			accessToken: SHOPIFY_ADMIN_ACCESS_TOKEN,
		};

		const client = new shopifyServer.clients.Graphql({ session: adminSession });

		// 1. Prüfe und erstelle Metaobjekt-Definition falls nötig
		const { exists: metaobjectExists } = await checkMetaobjectDefinition(client);

		if (!metaobjectExists) {
			const createResult = await createMetaobjectDefinition(client);
			if (!createResult.success) {
				return NextResponse.json(
					{ error: "Failed to create metaobject definition", errors: createResult.errors },
					{ status: 500 }
				);
			}
		}

		// 2. Prüfe und erstelle Shop-Metafeld-Definition falls nötig
		const { exists: shopMetafieldExists } = await checkShopMetafieldDefinition(client);

		if (!shopMetafieldExists) {
			const createResult = await createShopMetafieldDefinition(client);
			if (!createResult.success) {
				return NextResponse.json(
					{ error: "Failed to create shop metafield definition", errors: createResult.errors },
					{ status: 500 }
				);
			}
		}

		// 3. Erstelle neues Review-Metaobjekt
		const productGid = product_id.startsWith("gid://") ? product_id : `gid://shopify/Product/${product_id}`;
		const today = new Date().toISOString().split("T")[0];

		const createReviewMutation = `
			mutation CreateReview($handle: String!, $fields: [MetaobjectFieldInput!]!) {
				metaobjectCreate(metaobject: {
					type: "review",
					handle: $handle,
					fields: $fields
				}) {
					metaobject {
						id
						handle
					}
					userErrors {
						field
						message
					}
				}
			}
		`;

		// Generiere eindeutigen Handle
		const handle = `review-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

		const fields = [
			{ key: "name", value: name },
			{ key: "rating", value: rating.toString() },
			{ key: "kommentar", value: comment },
			{ key: "produkt", value: productGid },
			{ key: "published", value: "false" },
			{ key: "verifizierter_kaeufer", value: "false" },
			{ key: "datum", value: today },
		];

		const createResponse = await client.request(createReviewMutation, {
			variables: {
				handle,
				fields,
			},
			retries: 2,
		});

		const createResult = createResponse.data.metaobjectCreate;

		if (createResult.userErrors.length > 0) {
			return NextResponse.json(
				{ error: "Failed to create review", errors: createResult.userErrors },
				{ status: 500 }
			);
		}

		const reviewId = createResult.metaobject.id;

		// 4. Hole aktuelle Review-Liste vom Shop
		const getShopQuery = `
			query GetShopReviews {
				shop {
					id
					metafield(namespace: "custom", key: "bewertungen") {
						id
						value
					}
				}
			}
		`;

		const shopResponse = await client.request(getShopQuery, {
			retries: 2,
		});

		const shopId = shopResponse.data.shop.id;
		const currentMetafield = shopResponse.data.shop.metafield;

		// Parse existierende Review-IDs
		let reviewIds = [];
		if (currentMetafield?.value) {
			try {
				reviewIds = JSON.parse(currentMetafield.value);
			} catch (e) {
				console.warn("Error parsing existing reviews:", e);
			}
		}

		// 5. Füge neue Review-ID hinzu
		reviewIds.push(reviewId);

		// 6. Aktualisiere Shop-Metafeld mit neuer Review-Liste
		const updateMetafieldMutation = `
			mutation UpdateShopMetafield($metafields: [MetafieldsSetInput!]!) {
				metafieldsSet(metafields: $metafields) {
					metafields {
						id
						value
					}
					userErrors {
						field
						message
					}
				}
			}
		`;

		const updateResponse = await client.request(updateMetafieldMutation, {
			variables: {
				metafields: [
					{
						namespace: "custom",
						key: "bewertungen",
						type: "list.metaobject_reference",
						value: JSON.stringify(reviewIds),
						ownerId: shopId,
					},
				],
			},
			retries: 2,
		});

		const updateResult = updateResponse.data.metafieldsSet;

		if (updateResult.userErrors.length > 0) {
			return NextResponse.json(
				{ error: "Failed to update shop reviews list", errors: updateResult.userErrors },
				{ status: 500 }
			);
		}

		return NextResponse.json(
			{
				success: true,
				reviewId,
				message: "Review erfolgreich erstellt und wartet auf Freigabe",
			},
			{
				status: 200,
				headers: {
					"Access-Control-Allow-Origin": "*",
					"Access-Control-Allow-Methods": "POST, OPTIONS",
					"Access-Control-Allow-Headers": "Content-Type, Authorization",
				},
			}
		);
	} catch (err) {
		console.error("POST error:", err);
		return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
	}
}

export async function OPTIONS() {
	const response = new NextResponse(null, { status: 204 });
	response.headers.set("Access-Control-Allow-Origin", "*");
	response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
	response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
	return response;
}