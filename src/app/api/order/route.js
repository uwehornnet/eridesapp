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

		const query = `
  query GetOrders($first: Int!) {
    orders(first: $first, sortKey: CREATED_AT, reverse: true) {
      pageInfo {
        hasNextPage
      }
      edges {
        cursor
        node {
          id
          name
          createdAt
          lineItems(first: 5) {
            edges {
              node {
                title
                quantity
              }
            }
          }
        }
      }
    }
  }
`;

		const variables = { first: 50 };

		const response = await client.query({
			data: {
				query,
				variables,
			},
		});

		const order = response.body.data.order;

		if (!order) {
			return NextResponse.json({ error: "Order nicht gefunden" }, { status: 404 });
		}

		const lineItems = order.lineItems.edges.map(({ node }) => ({
			product_id: node.product?.id,
			title: node.product?.title,
			quantity: node.quantity,
		}));

		return NextResponse.json({ order: { id: order.id, name: order.name }, lineItems });
	} catch (error) {
		console.error("GraphQL Error:", error);
		return NextResponse.json({ error: "Fehler beim Laden der Bestellung" }, { status: 500 });
	}
}
