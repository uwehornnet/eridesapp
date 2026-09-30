import { NextResponse } from "next/server";
import shopifyServer from "@/lib/shopify.server.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SHOPIFY_HOST_NAME = process.env.SHOPIFY_HOST_NAME;
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const CRON_SECRET = process.env.CRON_SECRET;

// Produkt "Zuschlag Komfort-Lieferung" (_service-internal-delivery)
const SERVICE_PRODUCT_ID = process.env.SERVICE_PRODUCT_ID || "15723580621180";
// Varianten jünger als X Tage bleiben bestehen, da sie noch in offenen Warenkörben liegen können
const MAX_AGE_DAYS = Number(process.env.SERVICE_VARIANT_MAX_AGE_DAYS || 14);
// Bestellte Varianten werden mit diesem Metafeld markiert und nie gelöscht
const ORDERED_NAMESPACE = "custom";
const ORDERED_KEY = "bestellung";

const VARIANTS_QUERY = `
	query ServiceVariants($productId: ID!, $after: String) {
		product(id: $productId) {
			variants(first: 250, after: $after) {
				nodes {
					id
					title
					createdAt
					metafield(namespace: "${ORDERED_NAMESPACE}", key: "${ORDERED_KEY}") {
						value
					}
				}
				pageInfo {
					hasNextPage
					endCursor
				}
			}
		}
	}
`;

const ORDERS_QUERY = `
	query OrdersSince($query: String!, $after: String) {
		orders(first: 25, after: $after, query: $query, sortKey: CREATED_AT) {
			nodes {
				name
				lineItems(first: 30) {
					nodes {
						variant {
							id
						}
					}
				}
			}
			pageInfo {
				hasNextPage
				endCursor
			}
		}
	}
`;

const MARK_ORDERED_MUTATION = `
	mutation MarkOrdered($metafields: [MetafieldsSetInput!]!) {
		metafieldsSet(metafields: $metafields) {
			userErrors {
				field
				message
			}
		}
	}
`;

const DELETE_VARIANTS_MUTATION = `
	mutation DeleteVariants($productId: ID!, $variantsIds: [ID!]!) {
		productVariantsBulkDelete(productId: $productId, variantsIds: $variantsIds) {
			userErrors {
				field
				message
			}
		}
	}
`;

function chunk(array, size) {
	const chunks = [];
	for (let i = 0; i < array.length; i += size) {
		chunks.push(array.slice(i, i + size));
	}
	return chunks;
}

async function runQuery(graphqlClient, query, variables) {
	const response = await graphqlClient.query({ data: { query, variables } });
	if (response.body.errors) {
		throw new Error(JSON.stringify(response.body.errors));
	}
	return response.body.data;
}

async function fetchAllVariants(graphqlClient, productId) {
	const variants = [];
	let after = null;

	do {
		const data = await runQuery(graphqlClient, VARIANTS_QUERY, { productId, after });
		if (!data.product) {
			throw new Error(`Service-Produkt ${productId} nicht gefunden`);
		}
		variants.push(...data.product.variants.nodes);
		after = data.product.variants.pageInfo.hasNextPage ? data.product.variants.pageInfo.endCursor : null;
	} while (after);

	return variants;
}

// Liefert Map<variantId, orderName> für alle Kandidaten, die in einer Bestellung seit `since` vorkommen
async function findOrderedVariants(graphqlClient, candidateIds, since) {
	const ordered = new Map();
	let after = null;

	do {
		const data = await runQuery(graphqlClient, ORDERS_QUERY, {
			query: `created_at:>=${since}`,
			after,
		});

		for (const order of data.orders.nodes) {
			for (const lineItem of order.lineItems.nodes) {
				const variantId = lineItem.variant?.id;
				if (variantId && candidateIds.has(variantId) && !ordered.has(variantId)) {
					ordered.set(variantId, order.name);
				}
			}
		}

		after = data.orders.pageInfo.hasNextPage ? data.orders.pageInfo.endCursor : null;
	} while (after);

	return ordered;
}

export async function GET(req) {
	try {
		if (!SHOPIFY_HOST_NAME || !SHOPIFY_ADMIN_ACCESS_TOKEN) {
			return NextResponse.json({ error: "Missing Shopify credentials" }, { status: 500 });
		}

		// Vercel Cron sendet automatisch "Authorization: Bearer <CRON_SECRET>"
		if (!CRON_SECRET || req.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";

		const adminSession = {
			shop: SHOPIFY_HOST_NAME,
			accessToken: SHOPIFY_ADMIN_ACCESS_TOKEN,
		};
		const graphqlClient = new shopifyServer.clients.Graphql({ session: adminSession });
		const productId = `gid://shopify/Product/${SERVICE_PRODUCT_ID}`;

		// 1. Alle Varianten laden und Kandidaten bestimmen
		const variants = await fetchAllVariants(graphqlClient, productId);
		const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

		const candidates = variants.filter(
			(variant) =>
				variant.title !== "Default Title" &&
				!variant.metafield?.value &&
				new Date(variant.createdAt).getTime() < cutoff,
		);

		if (candidates.length === 0) {
			return NextResponse.json({ ok: true, dryRun, totalVariants: variants.length, deleted: 0, markedOrdered: 0 });
		}

		// 2. Bestellte Kandidaten finden (Bestellungen seit Anlage des ältesten Kandidaten)
		const oldestCreatedAt = candidates.reduce(
			(oldest, variant) => (variant.createdAt < oldest ? variant.createdAt : oldest),
			candidates[0].createdAt,
		);
		const candidateIds = new Set(candidates.map((variant) => variant.id));
		const ordered = await findOrderedVariants(graphqlClient, candidateIds, oldestCreatedAt);

		const toDelete = candidates.filter((variant) => !ordered.has(variant.id));

		console.log(
			`Variant cleanup: ${variants.length} Varianten, ${candidates.length} Kandidaten, ${ordered.size} bestellt, ${toDelete.length} zu löschen${dryRun ? " (dry run)" : ""}`,
		);

		if (!dryRun) {
			// 3. Bestellte Varianten markieren, damit sie künftig nicht erneut geprüft werden
			for (const batch of chunk([...ordered.entries()], 25)) {
				const data = await runQuery(graphqlClient, MARK_ORDERED_MUTATION, {
					metafields: batch.map(([variantId, orderName]) => ({
						ownerId: variantId,
						namespace: ORDERED_NAMESPACE,
						key: ORDERED_KEY,
						type: "single_line_text_field",
						value: orderName,
					})),
				});
				if (data.metafieldsSet.userErrors.length > 0) {
					console.error("metafieldsSet userErrors:", data.metafieldsSet.userErrors);
				}
			}

			// 4. Nicht bestellte, alte Varianten löschen
			for (const batch of chunk(toDelete, 250)) {
				const data = await runQuery(graphqlClient, DELETE_VARIANTS_MUTATION, {
					productId,
					variantsIds: batch.map((variant) => variant.id),
				});
				if (data.productVariantsBulkDelete.userErrors.length > 0) {
					console.error("productVariantsBulkDelete userErrors:", data.productVariantsBulkDelete.userErrors);
					return NextResponse.json(
						{ error: data.productVariantsBulkDelete.userErrors[0].message },
						{ status: 422 },
					);
				}
			}
		}

		return NextResponse.json({
			ok: true,
			dryRun,
			totalVariants: variants.length,
			candidates: candidates.length,
			markedOrdered: ordered.size,
			deleted: toDelete.length,
			orderedVariants: Object.fromEntries(ordered),
			...(dryRun ? { wouldDelete: toDelete.map((variant) => variant.title) } : {}),
		});
	} catch (error) {
		console.error("Error in variant cleanup route:", error);
		return NextResponse.json({ error: error.message || "Unknown server error" }, { status: 500 });
	}
}
