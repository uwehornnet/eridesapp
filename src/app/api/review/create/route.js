// POST /api/review.ts
import shopifyServer from "@/lib/shopify.server.js";
import { NextResponse } from "next/server";

const SHOPIFY_HOST_NAME = process.env.SHOPIFY_HOST_NAME;
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

const checkMetafieldDefinition = async (client) => {
	try {
		const checkQuery = `
			query CheckMetafield($first: Int!) {
				shop {
					id
					metafield(namespace: "reviews", key: "all") {
						id
						value
					}
				}
				metafieldDefinitions(first: $first, namespace: "reviews", key: "all", ownerType: SHOP) {
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
			variables: { first: 1 },
			retries: 2,
		});

		const metafieldExists = response.data.metafieldDefinitions.edges.length > 0;
		const shopId = response.data.shop.id;
		const existingMetafield = response.data.shop.metafield;

		return {
			exists: metafieldExists,
			shopId,
			metafield: existingMetafield,
		};
	} catch (error) {
		console.error("Error checking metafield definition:", error);
		return {
			exists: false,
			shopId: null,
			metafield: null,
		};
	}
};

const createMetafieldDefinition = async (client) => {
	try {
		const createMutation = `
			mutation CreateMetafieldDefinition {
				metafieldDefinitionCreate(definition: {
					name: "Produktbewertungen",
					namespace: "reviews",
					key: "all",
					type: "json",
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
			retries: 2, // optional
		});

		const result = response.data.metafieldDefinitionCreate;
		const success = result?.createdDefinition?.id && result.userErrors.length === 0;

		return {
			success,
			createdId: result?.createdDefinition?.id || null,
			errors: result.userErrors || [],
		};
	} catch (error) {
		console.error("Error creating metafield definition:", error);
		return {
			success: false,
			createdId: null,
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

		// 1. Prüfe, ob Metafield-Definition existiert
		const {
			exists, // true/false → existiert Definition?
			shopId, // z. B. "gid://shopify/Shop/123..."
			metafield, // bestehendes Metafeld oder null
		} = await checkMetafieldDefinition(client);

		console.log({ exists, shopId, metafield });
		// 2. Wenn nicht vorhanden, erstelle Definition
		if (!exists) {
			const createRes = await createMetafieldDefinition(client);
			const errors = createRes.body.data.metafieldDefinitionCreate.userErrors;
			if (errors.length > 0) {
				return NextResponse.json({ error: "Failed to create metafield definition", errors }, { status: 500 });
			}
		}

		// 4. Neue Bewertung anhängen
		// Hole bisherigen Wert aus bestehendem Metafeld
		const existingValue = metafield?.value;
		let current = [];

		if (existingValue) {
			try {
				current = JSON.parse(existingValue);
			} catch (e) {
				console.warn("Fehler beim Parsen des bestehenden Metafeld-Werts:", e);
				current = [];
			}
		}

		// 4. Neue Bewertung anhängen
		const newReview = {
			product_id,
			name,
			rating,
			comment,
			date: new Date().toISOString().split("T")[0],
		};

		const updated = [...current, newReview];

		// JSON-String vorbereiten (mit Escaping)
		const json = JSON.stringify(updated).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

		// 5. Speichern
		const metafieldTarget = `ownerId: "${shopId}"`;

		const saveMutation = `
			mutation {
				metafieldsSet(metafields: [{
					namespace: "reviews",
					key: "all",
					type: "json",
					value: "${json}",
					${metafieldTarget}
				}]) {
					metafields { id }
					userErrors { field message }
				}
			}
		`;
		const saveRes = await client.query({ data: saveMutation });
		const saveErrors = saveRes.body.data.metafieldsSet.userErrors;
		if (saveErrors.length > 0) {
			return NextResponse.json({ error: "Failed to save review", saveErrors }, { status: 500 });
		}

		return NextResponse.json({ success: true });
	} catch (err) {
		console.error("POST error:", err);
		return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
	}
}
