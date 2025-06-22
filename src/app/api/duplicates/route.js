import { NextResponse } from "next/server";
import shopifyServer from "@/lib/shopify.server.js";

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

		let allProducts = [];
		let page = 1;
		let hasMore = true;

		while (hasMore) {
			const res = await adminRESTClient.get({
				path: "products.json",
				query: {
					limit: 250,
					fields: "id,title,variants,created_at, status",
				},
			});

			const products = res.body.products;
			allProducts = allProducts.concat(products);

			hasMore = products.length === 250;
			page++;
		}

		if (!allProducts || allProducts.length === 0) {
			return new NextResponse("No products found", { status: 404 });
		}

		const skuMap = new Map();

		for (const product of allProducts) {
			if (product.status !== "active") continue;
			for (const variant of product.variants) {
				console.log(`Processing product: ${product.title}, variant: ${variant.title}`);
				const sku = variant.sku;
				if (!sku) continue;

				if (!skuMap.has(sku)) {
					skuMap.set(sku, new Map());
				}

				const skuProducts = skuMap.get(sku);
				if (!skuProducts.has(product.id)) {
					skuProducts.set(product.id, {
						sku,
						title: product.title,
						created_at: product.created_at,
						product_id: product.id,
					});
				}
			}
		}

		// Zwischenspeicher für zu löschende Produkt-IDs
		const toDeleteSet = new Set();

		for (const [sku, productMap] of skuMap.entries()) {
			const productList = Array.from(productMap.values());

			if (productList.length > 1) {
				const sorted = productList.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

				const oldest = sorted[0];
				toDeleteSet.add(oldest.product_id);
			}
		}

		// Umwandlung in Array zur Weiterverarbeitung oder Rückgabe
		const productIdsToDelete = Array.from(toDeleteSet);
		// Standard: Rohdaten als JSON
		return new NextResponse(
			JSON.stringify({
				count: productIdsToDelete.length,
				productIdsToDelete,
			}),
			{
				status: 200,
				headers: {
					"Content-Type": "application/json",
				},
			}
		);
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
