import shopifyServer from "@/lib/shopify.server.js";
import { NextResponse } from "next/server";

export async function GET(request) {
	try {
		const { searchParams } = new URL(request.url);
		const code = searchParams.get("code");

		if (!code) {
			return NextResponse.json({ error: "Discount code is required" }, { status: 400 });
		}

		const adminSession = {
			shop: process.env.SHOPIFY_HOST_NAME,
			accessToken: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
		};

		const client = new shopifyServer.clients.Graphql({ session: adminSession });

		const query = `
			query getDiscountCode($code: String!) {
				codeDiscountNodes(first: 1, query: $code) {
					edges {
						node {
							id
							codeDiscount {
								... on DiscountCodeBasic {
									title
									codes(first: 1) {
										edges {
											node {
												code
											}
										}
									}
									customerGets {
										value {
											... on DiscountPercentage {
												percentage
											}
											... on DiscountAmount {
												amount {
													amount
												}
											}
										}
										items {
											... on AllDiscountItems {
												allItems
											}
											... on DiscountProducts {
												products(first: 250) {
													edges {
														node {
															id
															title
															handle
														}
													}
												}
											}
											... on DiscountCollections {
												collections(first: 250) {
													edges {
														node {
															id
															title
															handle
														}
													}
												}
											}
										}
									}
									minimumRequirement {
										... on DiscountMinimumQuantity {
											greaterThanOrEqualToQuantity
										}
										... on DiscountMinimumSubtotal {
											greaterThanOrEqualToSubtotal {
												amount
											}
										}
									}
									startsAt
									endsAt
									status
									usageLimit
								}
								... on DiscountCodeBxgy {
									title
									codes(first: 1) {
										edges {
											node {
												code
											}
										}
									}
									customerGets {
										value {
											... on DiscountPercentage {
												percentage
											}
											... on DiscountAmount {
												amount {
													amount
												}
											}
										}
										items {
											... on AllDiscountItems {
												allItems
											}
											... on DiscountProducts {
												products(first: 250) {
													edges {
														node {
															id
															title
															handle
														}
													}
												}
											}
											... on DiscountCollections {
												collections(first: 250) {
													edges {
														node {
															id
															title
															handle
														}
													}
												}
											}
										}
									}
									customerBuys {
										items {
											... on AllDiscountItems {
												allItems
											}
											... on DiscountProducts {
												products(first: 250) {
													edges {
														node {
															id
															title
															handle
														}
													}
												}
											}
										}
									}
									startsAt
									endsAt
									status
								}
								... on DiscountCodeFreeShipping {
									title
									codes(first: 1) {
										edges {
											node {
												code
											}
										}
									}
									startsAt
									endsAt
									status
								}
							}
						}
					}
				}
			}
		`;

		const response = await client.query({
			data: {
				query,
				variables: { code },
			},
		});

		const edges = response.body.data.codeDiscountNodes.edges;

		if (edges.length === 0) {
			return NextResponse.json({ error: "Discount code not found", valid: false }, { status: 404 });
		}

		const discount = edges[0].node.codeDiscount;

		// Basis-Informationen
		let discountInfo = {
			code: code,
			title: discount.title,
			status: discount.status,
			startsAt: discount.startsAt,
			endsAt: discount.endsAt,
			valid: discount.status === "ACTIVE",
			usageLimit: discount.usageLimit,
		};

		// Typ und Wert extrahieren
		if (discount.customerGets?.value) {
			const value = discount.customerGets.value;

			if (value.percentage !== undefined) {
				discountInfo.type = "percentage";
				discountInfo.value = value.percentage * 100;
			} else if (value.amount) {
				discountInfo.type = "fixed_amount";
				discountInfo.value = parseFloat(value.amount.amount) * 100;
			}
		} else if (discount.__typename === "DiscountCodeFreeShipping") {
			discountInfo.type = "free_shipping";
			discountInfo.value = 0;
		}

		// Minimum Requirements
		if (discount.minimumRequirement) {
			if (discount.minimumRequirement.greaterThanOrEqualToQuantity) {
				discountInfo.minimumQuantity = discount.minimumRequirement.greaterThanOrEqualToQuantity;
			}
			if (discount.minimumRequirement.greaterThanOrEqualToSubtotal) {
				discountInfo.minimumSubtotal =
					parseFloat(discount.minimumRequirement.greaterThanOrEqualToSubtotal.amount) * 100;
			}
		}

		// Produkt-Einschränkungen extrahieren
		let productIds = [];
		let productHandles = [];
		let productTitles = [];
		let collectionIds = [];
		let collectionHandles = [];
		let appliesTo = "all";

		if (discount.customerGets?.items) {
			const items = discount.customerGets.items;

			if (items.allItems) {
				appliesTo = "all";
			} else if (items.products) {
				appliesTo = "specific_products";

				items.products.edges.forEach((edge) => {
					// Extrahiere numerische ID aus GID
					const gid = edge.node.id; // "gid://shopify/Product/8522924228900"
					const numericId = gid.split("/").pop();

					productIds.push(numericId);
					productHandles.push(edge.node.handle);
					productTitles.push(edge.node.title);
				});
			} else if (items.collections) {
				appliesTo = "specific_collections";

				items.collections.edges.forEach((edge) => {
					const gid = edge.node.id;
					const numericId = gid.split("/").pop();

					collectionIds.push(numericId);
					collectionHandles.push(edge.node.handle);
				});
			}
		}

		// BXGY: Produkte die gekauft werden müssen
		let requiresProductIds = [];
		if (discount.customerBuys?.items?.products) {
			discount.customerBuys.items.products.edges.forEach((edge) => {
				const gid = edge.node.id;
				const numericId = gid.split("/").pop();
				requiresProductIds.push(numericId);
			});
		}

		// Füge Produkt-Informationen hinzu
		discountInfo.appliesTo = appliesTo;

		if (appliesTo === "specific_products") {
			discountInfo.productIds = productIds;
			discountInfo.productHandles = productHandles;
			discountInfo.productTitles = productTitles;
		} else if (appliesTo === "specific_collections") {
			discountInfo.collectionIds = collectionIds;
			discountInfo.collectionHandles = collectionHandles;
		}

		if (requiresProductIds.length > 0) {
			discountInfo.requiresProductIds = requiresProductIds;
		}

		return NextResponse.json(discountInfo, {
			status: 200,
			headers: {
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Methods": "GET, OPTIONS",
				"Access-Control-Allow-Headers": "Content-Type, Authorization",
			},
		});
	} catch (error) {
		console.error("Error looking up discount:", error);
		return NextResponse.json({ error: "Failed to lookup discount", details: error.message }, { status: 500 });
	}
}

export async function OPTIONS() {
	const response = new NextResponse(null, { status: 204 });
	response.headers.set("Access-Control-Allow-Origin", "*");
	response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
	response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
	return response;
}
