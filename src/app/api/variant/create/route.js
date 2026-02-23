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
		const item = body.items?.[0];

		if (!item) {
			return NextResponse.json({ error: "Missing items in payload" }, { status: 400 });
		}

		const { properties, price, id } = item;

		// dynamischer Preis → convert to shopify price format
		const formattedPrice = (price / 100).toFixed(2);

		const adminSession = {
			shop: SHOPIFY_HOST_NAME,
			accessToken: SHOPIFY_ADMIN_ACCESS_TOKEN,
		};

		const graphqlClient = new shopifyServer.clients.Graphql({ session: adminSession });

		// 1. Variante erstellen via GraphQL
		const createMutation = `
            mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
                productVariantsBulkCreate(productId: $productId, variants: $variants) {
                    productVariants {
                        id
                        legacyResourceId
                        inventoryItem {
                            id
                        }
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }
        `;

		const variantTitle = "dynamic_" + Date.now() + "_" + Math.random().toString(36).slice(2);
		const createResponse = await graphqlClient.request(createMutation, {
			variables: {
				productId: `gid://shopify/Product/${id}`,
				variants: [
					{
						optionValues: [{ optionName: "Title", name: variantTitle }],
						price: formattedPrice,
						inventoryPolicy: "CONTINUE",
						inventoryItem: {
							tracked: false,
							sku: "srv_" + variantTitle,
							requiresShipping: false,
						},
					},
				],
			},
		});

		const createdVariant = createResponse.body.data.productVariantsBulkCreate.productVariants[0];
		const inventoryItemId = createdVariant.inventoryItem.id; // bereits im Query enthalten

		// Inventory Level aktivieren
		const inventoryMutation = `
    mutation inventoryBulkToggleActivation($inventoryItemId: ID!, $inventoryItemUpdates: [InventoryBulkToggleActivationInput!]!) {
        inventoryBulkToggleActivation(inventoryItemId: $inventoryItemId, inventoryItemUpdates: $inventoryItemUpdates) {
            inventoryItem {
                id
            }
            inventoryLevels {
                quantities(names: ["available"]) {
                    quantity
                }
            }
            userErrors {
                field
                message
            }
        }
    }
`;

		await graphqlClient.request(inventoryMutation, {
			variables: {
				inventoryItemId: inventoryItemId,
				inventoryItemUpdates: [
					{
						locationId: `gid://shopify/Location/104671773052`,
						activate: true,
					},
				],
			},
		});

		// Bestand setzen
		const setQuantityMutation = `
			mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
				inventorySetQuantities(input: $input) {
					inventoryAdjustmentGroup {
						id
					}
					userErrors {
						field
						message
					}
				}
			}
		`;

		await graphqlClient.request(setQuantityMutation, {
			variables: {
				input: {
					name: "available",
					reason: "correction",
					quantities: [
						{
							inventoryItemId: inventoryItemId,
							locationId: `gid://shopify/Location/104671773052`,
							quantity: 999,
						},
					],
				},
			},
		});

		const userErrors = createResponse.body.data.productVariantsBulkCreate.userErrors;
		if (userErrors.length > 0) {
			console.error("GraphQL userErrors:", userErrors);
			return NextResponse.json({ error: userErrors[0].message }, { status: 422 });
		}

		//const createdVariant = createResponse.body.data.productVariantsBulkCreate.productVariants[0];
		const variantLegacyId = createdVariant.legacyResourceId; // numerische ID für cart/add.js

		// const adminRESTClient = new shopifyServer.clients.Rest({
		// 	session: adminSession,
		// });

		// // Zufällige Option (jede Variante braucht eine eigene Option)
		// const variantTitle = "dynamic_" + Date.now() + "_" + Math.random().toString(36).slice(2);

		// // Variante erzeugen
		// const createVariantResponse = await adminRESTClient.post({
		// 	path: `products/${id}/variants.json`,
		// 	data: {
		// 		variant: {
		// 			option1: variantTitle,
		// 			price: formattedPrice,
		// 			sku: "srv_" + variantTitle,

		// 			// 🔧 WICHTIG:
		// 			inventory_management: "shopify",
		// 			inventory_policy: "continue", // erlaubt Kauf ohne Bestand
		// 			fulfillment_service: "manual",
		// 			requires_shipping: false,

		// 			metafields: [
		// 				{
		// 					namespace: "custom",
		// 					key: "dynamic",
		// 					value: "true",
		// 					type: "boolean",
		// 				},
		// 				{
		// 					namespace: "custom",
		// 					key: "json_properties",
		// 					value: JSON.stringify(properties || {}),
		// 					type: "single_line_text_field",
		// 				},
		// 			],
		// 		},
		// 	},
		// 	type: "application/json",
		// });

		// const createdVariant = createVariantResponse.body.variant;
		// const locationId = 104671773052;

		// const set_inventory_response = await adminRESTClient.post({
		// 	path: "inventory_levels/set.json",
		// 	data: {
		// 		location_id: locationId,
		// 		inventory_item_id: createdVariant.inventory_item_id,
		// 		available: 999,
		// 	},
		// 	type: "application/json",
		// });
		// console.log("Set inventory level response:", JSON.stringify(set_inventory_response.body));

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
