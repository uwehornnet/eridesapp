import { NextResponse } from "next/server";
import shopifyServer from "@/lib/shopify.server.js";
import { parse } from "querystring";

const SHOPIFY_HOST_NAME = process.env.SHOPIFY_HOST_NAME;
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

export async function GET() {
	try {
		if (!SHOPIFY_HOST_NAME || !SHOPIFY_ADMIN_ACCESS_TOKEN) {
			return NextResponse.json({ error: "Missing Shopify credentials" }, { status: 500 });
		}

		const adminSession = {
			shop: SHOPIFY_HOST_NAME,
			accessToken: SHOPIFY_ADMIN_ACCESS_TOKEN,
		};
		const adminRESTClient = new shopifyServer.clients.Rest({ session: adminSession });
		const productResponse = await adminRESTClient.get({
			path: "products.json",
			query: { fields: "id,title,variants" },
		});
		const products = productResponse.body.products;

		return new NextResponse(products, {
			status: 200,
			headers: {
				"Content-Type": "application/json",
			},
		});
	} catch (error) {
		console.error("Error in GET request:", error);
		return new NextResponse(error.message, {
			status: 200,
			headers: {
				"Content-Type": "text/html",
			},
		});
	}
}
