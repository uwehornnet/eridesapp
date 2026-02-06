import shopifyServer from "@/lib/shopify.server.js";
import { NextResponse } from "next/server";

export async function GET() {
	try {
		// Shopify-Session initialisieren
		const adminSession = {
			shop: process.env.SHOPIFY_HOST_NAME,
			accessToken: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
		};

		const client = new shopifyServer.clients.Graphql({ session: adminSession });

		const query = `
			query {
				shop {
					metafield(namespace: "custom.bewertungen", key: "all") {
						value
					}
				}
			}
		`;

		const response = await client.query({ data: query });
		const raw = response.body.data.shop.metafield?.value;

		const parsed = raw ? JSON.parse(raw) : [];

		return NextResponse.json({ reviews: parsed });
	} catch (error) {
		console.error("Error loading reviews:", error);
		return NextResponse.json({ error: "Failed to load reviews" }, { status: 500 });
	}
}
