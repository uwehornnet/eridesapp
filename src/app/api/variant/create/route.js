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

		const adminRESTClient = new shopifyServer.clients.Rest({
			session: adminSession,
		});

		// Zufällige Option (jede Variante braucht eine eigene Option)
		const variantTitle = "dynamic_" + Date.now() + "_" + Math.random().toString(36).slice(2);

		// Variante erzeugen
		const createVariantResponse = await adminRESTClient.post({
			path: `products/${id}/variants.json`,
			data: {
				variant: {
					option1: variantTitle,
					price: formattedPrice,
					sku: "srv_" + variantTitle,

					// 🔧 WICHTIG:
					inventory_management: null,
					inventory_policy: "continue", // erlaubt Kauf ohne Bestand
					fulfillment_service: "manual",
					requires_shipping: false,

					metafields: [
						{
							namespace: "custom",
							key: "dynamic",
							value: "true",
							type: "boolean",
						},
						{
							namespace: "custom",
							key: "json_properties",
							value: JSON.stringify(properties || {}),
							type: "single_line_text_field",
						},
					],
				},
			},
			type: "application/json",
		});


		const createdVariant = createVariantResponse.body.variant;

		const putResponse = await adminRESTClient.put({
			path: `variants/${createdVariant.id}.json`,
			data: {
				variant: {
					id: createdVariant.id,
					inventory_management: null,
					inventory_policy: "continue",
				},
			},
			type: "application/json",
		});

		console.log("PUT variant result:", JSON.stringify(putResponse.body.variant?.inventory_management));
		console.log("PUT variant policy:", JSON.stringify(putResponse.body.variant?.inventory_policy));

		const locationId = 104671773052;
		await adminRESTClient.post({
			path: "inventory_levels/connect.json",
			data: {
				location_id: locationId,
				inventory_item_id: createdVariant.inventory_item_id,
			},
			type: "application/json",
		});

		return NextResponse.json(
			{
				ok: true,
				variantId: createdVariant.id,
				price: price,
				properties,
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
