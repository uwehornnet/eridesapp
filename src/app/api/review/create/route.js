// POST /api/review.ts
import shopifyServer from "@/lib/shopify.server.js";
import { NextResponse } from "next/server";

const SHOPIFY_HOST_NAME = process.env.SHOPIFY_HOST_NAME;
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

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

		// 1. Erstelle neues Review-Metaobjekt
		const productGid = product_id.startsWith("gid://") ? product_id : `gid://shopify/Product/${product_id}`;
		const today = new Date().toISOString().split("T")[0];

		// Generiere eindeutigen Handle
		const handle = `kundenbewertung-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

		const createReviewMutation = `
			mutation CreateReview($handle: String!, $fields: [MetaobjectFieldInput!]!) {
				metaobjectCreate(metaobject: {
					type: "kundenbewertung",
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

		const fields = [
			{ key: "name", value: name },
			{ key: "rating", value: rating.toString() },
			{ key: "kommentar", value: comment },
			{ key: "produkt", value: productGid },
			{ key: "published", value: "false" },
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

		// 2. Hole aktuelle Review-Liste vom Shop
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
				reviewIds = [];
			}
		}

		// 3. Füge neue Review-ID hinzu
		reviewIds.push(reviewId);

		// 4. Aktualisiere Shop-Metafeld mit neuer Review-Liste
		const updateMetafieldMutation = `
			mutation UpdateShopMetafield($ownerId: ID!, $value: String!) {
				metafieldsSet(metafields: [{
					namespace: "custom",
					key: "bewertungen",
					type: "list.metaobject_reference",
					value: $value,
					ownerId: $ownerId
				}]) {
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
				ownerId: shopId,
				value: JSON.stringify(reviewIds),
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