import { NextResponse } from "next/server";
import shopifyServer from "@/lib/shopify.server.js";

const SHOPIFY_HOST_NAME = process.env.SHOPIFY_HOST_NAME;
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;


export async function POST(req) {
	try {
		if (!SHOPIFY_HOST_NAME || !SHOPIFY_ADMIN_ACCESS_TOKEN) {
			return NextResponse.json({ error: "Missing Shopify credentials" }, { status: 500 });
		}

		// JSON Payload lesen
		const body = await req.json();
		console.log("Received payload:", JSON.stringify(body));
		const item = body.items?.[0];

		if (!item) {
			return NextResponse.json({ error: "Missing items in payload" }, { status: 400 });
		}

		const { properties, price, id } = item;

		console.log(properties);
		// dynamischer Preis → convert to shopify price format
		const formattedPrice = (price / 100).toFixed(2);

		const adminSession = {
			shop: SHOPIFY_HOST_NAME,
			accessToken: SHOPIFY_ADMIN_ACCESS_TOKEN,
		};

		const graphqlClient = new shopifyServer.clients.Graphql({ session: adminSession });

		// 1. Variante erstellen via GraphQL

		let variantTitle = Date.now() + ""; // Default Titel mit Timestamp, falls keine Eigenschaften vorhanden sind

		if (properties.Montage != "Nein") {
			variantTitle += " - mit Montage";
		}

		if (properties.Montage == "Nein") {
			variantTitle += " - ohne Montage";
		}

		if (properties.Verpackungsrücknahme == "Ja") {
			variantTitle += " - mit Verpackungsrücknahme";
		}

		if (properties.Verpackungsrücknahme == "Nein") {
			variantTitle += " - ohne Verpackungsrücknahme";
		}

		const createResponse = await graphqlClient.query({
			data: {
				query: `
					mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
						productVariantsBulkCreate(productId: $productId, variants: $variants) {
							product {
								id
							}
							productVariants {
								id
								legacyResourceId
								inventoryPolicy
								inventoryItem {
									id
									tracked
								}
								metafields(first: 1) {
									edges {
										node {
										namespace
										key
										value
										}
									}
								}
							}
							userErrors {
								field
								message
							}
						}
					}
				`,
				variables: {
					productId: `gid://shopify/Product/${id}`,
					variants: [
						{
							price: formattedPrice,
							inventoryPolicy: "CONTINUE",
							inventoryItem: {
								tracked: false,
							},
							optionValues: [{ optionName: "Title", name: variantTitle }],
							metafields: [
								{
									namespace: "custom",
									key: "json_properties",
									value: JSON.stringify(properties || {}),
									type: "multi_line_text_field",
								},
							],
						},
					],
				},
			},
		});

		const createdVariant = createResponse.body.data.productVariantsBulkCreate.productVariants[0];

		const userErrors = createResponse.body.data.productVariantsBulkCreate.userErrors;
		if (userErrors.length > 0) {
			console.error("GraphQL userErrors:", userErrors);
			return NextResponse.json({ error: userErrors[0].message }, { status: 422 });
		}

		//const createdVariant = createResponse.body.data.productVariantsBulkCreate.productVariants[0];
		const variantLegacyId = createdVariant.legacyResourceId; // numerische ID für cart/add.js

		return NextResponse.json(
			{ ok: true, variantId: variantLegacyId, price, properties },
			{
				status: 200,
				headers: {
					"Access-Control-Allow-Origin": "*",
					"Access-Control-Allow-Methods": "POST, OPTIONS",
					"Access-Control-Allow-Headers": "Content-Type, Authorization",
				},
			},
		);
	} catch (error) {
		console.error("Error in variant creation route:", error);
		return NextResponse.json({ error: error.message || "Unknown server error" }, { status: 500 });
	}
}


export async function OPTIONS() {
	const response = new NextResponse(null, { status: 204 });
	response.headers.set("Access-Control-Allow-Origin", "*");
	response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
	response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
	return response;
}
