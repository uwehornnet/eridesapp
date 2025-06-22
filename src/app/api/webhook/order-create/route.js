import { NextResponse } from "next/server";
import shopifyServer from "@/lib/shopify.server.js";

const SHOPIFY_HOST_NAME = process.env.SHOPIFY_HOST_NAME;
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

export async function POST() {
	try {
		if (!SHOPIFY_HOST_NAME || !SHOPIFY_ADMIN_ACCESS_TOKEN) {
			return NextResponse.json({ error: "Missing Shopify credentials" }, { status: 500 });
		}

		const adminSession = {
			shop: SHOPIFY_HOST_NAME,
			accessToken: SHOPIFY_ADMIN_ACCESS_TOKEN,
		};
		const adminRESTClient = new shopifyServer.clients.Rest({ session: adminSession });

		// Standard: Rohdaten als JSON
		return new NextResponse(JSON.stringify({}), {
			status: 200,
			headers: {
				"Content-Type": "application/json",
			},
		});
	} catch (error) {
		console.error("Error in GET request:", error);
		return new NextResponse(error.message, {
			status: 500,
			headers: {
				"Content-Type": "text/html",
			},
		});
	}
}
