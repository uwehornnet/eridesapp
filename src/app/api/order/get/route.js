// /app/api/order/route.js
import shopifyServer from "@/lib/shopify.server.js";
import { NextResponse } from "next/server";

export async function GET(req) {
	const { searchParams } = new URL(req.url);
	const orderId = searchParams.get("order_id");

	if (!orderId) {
		return NextResponse.json({ error: "order_id fehlt" }, { status: 400 });
	}

	try {
		const adminSession = {
			shop: process.env.SHOPIFY_HOST_NAME,
			accessToken: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
		};

		const client = new shopifyServer.clients.Graphql({ session: adminSession });

		const query = `{
			orders(first: 5, sortKey: CREATED_AT, reverse: true) {
				edges {
				node {
					id
					name
					email
					createdAt
					note
					totalPriceSet {
					shopMoney {
						amount
						currencyCode
					}
					}
				}
				}
			}
			}`;

		const response = await client.query({
			data: {
				query,
			},
		});

		const order = response.body.data.orders.edges;
		if (!order) {
			return NextResponse.json({ error: "Order nicht gefunden" }, { status: 404 });
		}

		return NextResponse.json({ response }, { status: 200 });

		
	} catch (error) {
		console.error("GraphQL Error:", error);
		return NextResponse.json({ error: "Fehler beim Laden der Bestellung" }, { status: 500 });
	}
}
