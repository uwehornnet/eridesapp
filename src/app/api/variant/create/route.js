import { NextResponse } from "next/server";
import shopifyServer from "@/lib/shopify.server.js";

const SHOPIFY_HOST_NAME = process.env.SHOPIFY_HOST_NAME;
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

// Hier die Produkt-ID deines Hidden-Service-Produkts eintragen!
const SERVICE_PRODUCT_ID = "xxxxxxxxxxxx";

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

		const { quantity, properties, price } = item;

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
			path: `products/${SERVICE_PRODUCT_ID}/variants.json`,
			data: {
				variant: {
					option1: variantTitle,
					price: formattedPrice,
					sku: "srv_" + variantTitle,
					metafields: [
						{
							namespace: "custom",
							key: "dynamic",
							value: "true",
							type: "boolean",
						},
						{
							namespace: "custom",
							key: "properties_json",
							value: JSON.stringify(properties || {}),
							type: "single_line_text_field",
						},
					],
				},
			},
			type: "application/json",
		});

		const createdVariant = createVariantResponse.body.variant;

		return NextResponse.json({
			ok: true,
			variantId: createdVariant.id,
			price: price,
			properties,
		});
	} catch (error) {
		console.error("Error in variant creation route:", error);
		return NextResponse.json({ error: error.message || "Unknown server error" }, { status: 500 });
	}
}
