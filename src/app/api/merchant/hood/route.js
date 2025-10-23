import { NextResponse } from "next/server";
import shopifyServer from "@/lib/shopify.server.js";

const SHOPIFY_HOST_NAME = process.env.SHOPIFY_HOST_NAME;
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

/**
 * Bulk Operation für große Datenmengen ohne Query-Kosten-Limits
 * Dies ist die empfohlene Methode von Shopify für große Exports
 */
const queryProductsWithBulkOperation = async (session) => {
	const graphqlClient = new shopifyServer.clients.Graphql({ session: session });

	// Schritt 1: Bulk Operation starten
	const bulkOperationQuery = `
		mutation {
			bulkOperationRunQuery(
				query: """
				{
					products {
						edges {
							node {
								id
								title
								handle
								vendor
								productType
								bodyHtml
								status
								images {
									edges {
										node {
											originalSrc
										}
									}
								}
								variants {
									edges {
										node {
											id
											title
											price
											barcode
											sku
											availableForSale
											compareAtPrice
											image {
												originalSrc
												altText
											}
											metafields {
												edges {
													node {
														namespace
														key
														value
														type
													}
												}
											}
										}
									}
								}
								metafields {
									edges {
										node {
											namespace
											key
											value
											type
										}
									}
								}
							}
						}
					}
				}
				"""
			) {
				bulkOperation {
					id
					status
				}
				userErrors {
					field
					message
				}
			}
		}
	`;

	const bulkResponse = await graphqlClient.query({
		data: bulkOperationQuery,
	});

	const bulkOperation = bulkResponse.body.data.bulkOperationRunQuery.bulkOperation;
	const operationId = bulkOperation.id;

	console.log("Bulk Operation gestartet:", operationId);

	// Schritt 2: Warte bis die Bulk Operation fertig ist
	let status = "RUNNING";
	let downloadUrl = null;

	while (status === "RUNNING" || status === "CREATED") {
		await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 Sekunden warten

		const pollQuery = `
			query {
				node(id: "${operationId}") {
					... on BulkOperation {
						id
						status
						errorCode
						url
						objectCount
					}
				}
			}
		`;

		const pollResponse = await graphqlClient.query({
			data: { query: pollQuery },
		});

		const operation = pollResponse.body.data.node;
		status = operation.status;
		downloadUrl = operation.url;

		console.log("Status:", status, "Objekte:", operation.objectCount);

		if (status === "FAILED") {
			throw new Error(`Bulk Operation fehlgeschlagen: ${operation.errorCode}`);
		}
	}

	// Schritt 3: JSONL-Daten herunterladen und verarbeiten
	console.log("Download-URL:", downloadUrl);

	const fileResponse = await fetch(downloadUrl);
	const jsonlData = await fileResponse.text();

	// JSONL in JavaScript-Objekte umwandeln
	const lines = jsonlData.trim().split("\n");
	const allData = lines.map((line) => JSON.parse(line));

	// Daten strukturieren
	const productsMap = new Map();

	allData.forEach((item) => {
		if (item.__parentId) {
			// Dies ist ein Child-Element (Variante, Metafeld, etc.)
			const parentId = item.__parentId;
			if (!productsMap.has(parentId)) {
				productsMap.set(parentId, { variants: [], metafields: [], images: [] });
			}
			const parent = productsMap.get(parentId);

			if (item.price !== undefined) {
				// Es ist eine Variante
				if (!parent.variants) parent.variants = [];
				parent.variants.push(item);
			} else if (item.namespace !== undefined) {
				// Es ist ein Metafeld
				if (!parent.metafields) parent.metafields = [];
				parent.metafields.push(item);
			} else if (item.originalSrc !== undefined) {
				// Es ist ein Bild
				if (!parent.images) parent.images = [];
				parent.images.push(item);
			}
		} else if (item.title !== undefined) {
			// Es ist ein Produkt
			if (!productsMap.has(item.id)) {
				productsMap.set(item.id, { ...item, variants: [], metafields: [], images: [] });
			} else {
				Object.assign(productsMap.get(item.id), item);
			}
		}
	});

	return Array.from(productsMap.values());
};

/**
 * Fallback: Standard-Pagination mit reduzierten Limits
 */
const queryProductsWithPagination = async (session) => {
	let hasNextPage = true;
	let cursor = null;
	const allProducts = [];

	const graphqlClient = new shopifyServer.clients.Graphql({ session: session });

	while (hasNextPage) {
		const query = `
		query getProducts($cursor: String) {
			products(first: 25, after: $cursor) {
				pageInfo {
					hasNextPage
				}
				edges {
					cursor
					node {
						id
						title
						handle
						vendor
						productType
						bodyHtml
						status
						images(first: 5) {
							edges {
								node {
									originalSrc
								}
							}
						}
						variants(first: 25) {
							edges {
								node {
									id
									title
									price
									barcode
									sku
									availableForSale
									compareAtPrice
									image {
										originalSrc
										altText
									}
									metafields(first: 25) {
										edges {
											node {
												namespace
												key
												value
												type
											}
										}
									}
								}
							}
						}
						metafields(first: 25) {
							edges {
								node {
									namespace
									key
									value
									type
								}
							}
						}
					}
				}
			}
		}`;

		const response = await graphqlClient.query({
			data: {
				query,
				variables: { cursor },
			},
		});

		const productEdges = response.body.data.products.edges;
		for (const edge of productEdges) {
			allProducts.push(edge.node);
		}
		hasNextPage = response.body.data.products.pageInfo.hasNextPage;
		cursor = hasNextPage ? productEdges[productEdges.length - 1].cursor : null;

		// Pause zwischen Requests
		if (hasNextPage) {
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
	}

	return allProducts;
};

const processProducts = (allProducts) => {
	const response = [];

	allProducts.forEach((product) => {
		// Verarbeite Varianten (aus Bulk oder Pagination)
		const variants = product.variants?.edges
			? product.variants.edges.map((edge) => edge.node)
			: product.variants || [];

		// Verarbeite Bilder
		const images = product.images?.edges
			? product.images.edges.map((edge) => edge.node.originalSrc)
			: product.images?.map((img) => img.originalSrc) || [];

		// Verarbeite Produkt-Metafelder
		const productMetafields = {};
		const metafieldEdges = product.metafields?.edges || product.metafields || [];
		const productMetafieldsList = metafieldEdges.map ? metafieldEdges : metafieldEdges.edges || [];

		productMetafieldsList.forEach((item) => {
			const metafield = item.node || item;
			const key = `${metafield.namespace}.${metafield.key}`;

			try {
				productMetafields[key] = JSON.parse(metafield.value);
			} catch (e) {
				productMetafields[key] = metafield.value;
			}
		});

		const lieferzeit = productMetafields["custom.lieferzeit"] || "";
		const versandkosten = productMetafields["custom.versandkosten"] || "";

		// Prüfe ob es ein einfaches Produkt ist
		const isSimpleProduct = variants.length === 1 && variants[0].title === "Default Title";

		variants.forEach((variant) => {
			const gid = variant.id;
			const variantID = gid.split("/").pop();
			const brutto = parseFloat(variant.price);
			const mwst = 0.19;
			const netto = +(brutto / (1 + mwst)).toFixed(2);
			const variantImage = variant.image?.originalSrc || images[0] || "";

			// Verarbeite Varianten-Metafelder
			const variantMetafields = {};
			const variantMetafieldEdges = variant.metafields?.edges || variant.metafields || [];
			const variantMetafieldsList = variantMetafieldEdges.map
				? variantMetafieldEdges
				: variantMetafieldEdges.edges || [];

			variantMetafieldsList.forEach((item) => {
				const metafield = item.node || item;
				const key = `${metafield.namespace}.${metafield.key}`;

				try {
					variantMetafields[key] = JSON.parse(metafield.value);
				} catch (e) {
					variantMetafields[key] = metafield.value;
				}
			});

			const time_to_deliver = parseInt(lieferzeit);
			const delivery_time = time_to_deliver ? `${time_to_deliver - 1} - ${time_to_deliver + 1} Werktage` : "";

			const shipping_cost = versandkosten?.amount || versandkosten || "";

			const productTitle = isSimpleProduct ? product.title : `${product.title} - ${variant.title}`;

			response.push({
				title: productTitle,
				description: product.bodyHtml,
				price_netto: netto,
				price_brutto: brutto,
				compare_at_price: variant.compareAtPrice ? parseFloat(variant.compareAtPrice) : null,
				currency: "EUR",
				aan: variant.sku,
				ean: variant.barcode,
				delivery_time: delivery_time,
				shipping_costs: shipping_cost,
				stock: variant.availableForSale ? "Auf Lager" : "Nicht auf Lager",
				category: product.productType,
				preview_image: variantImage,
				product_image: variantImage,
				images: images,
				brand: product.vendor,
				link: `https://erides.de/products/${product.handle}?variant=${variantID}`,
				is_simple_product: isSimpleProduct,
				all_metafields: { ...productMetafields, ...variantMetafields },
			});
		});
	});

	return response;
};

export async function GET(request) {
	try {
		if (!SHOPIFY_HOST_NAME || !SHOPIFY_ADMIN_ACCESS_TOKEN) {
			return NextResponse.json({ error: "Missing Shopify credentials" }, { status: 500 });
		}

		const adminSession = {
			shop: SHOPIFY_HOST_NAME,
			accessToken: SHOPIFY_ADMIN_ACCESS_TOKEN,
		};

		// Query-Parameter prüfen: useBulk=true für Bulk Operations
		// const { searchParams } = new URL(request.url);
		// const useBulk = searchParams.get("useBulk") === "true";
		const useBulk = true;

		let allProducts;

		if (useBulk) {
			console.log("Verwende Bulk Operations (empfohlen für große Datenmengen)");
			allProducts = await queryProductsWithBulkOperation(adminSession);
		} else {
			console.log("Verwende Standard-Pagination (für kleinere Shops)");
			allProducts = await queryProductsWithPagination(adminSession);
		}

		const products = processProducts(allProducts);

		// CSV-Header
		let csv = [
			"Deeplink",
			"Produkt-Titel",
			"Produktbeschreibung",
			"Produktbeschreibung lang",
			"Streichpreis",
			"Preis (Brutto)",
			"Preis (Netto)",
			"Währung",
			"europäische Artikelnummer EAN",
			"Anbieter Artikelnummer AAN",
			"Hersteller",
			"Hersteller Artikelnummer HAN",
			"Produktbild-URL",
			"Vorschaubild-URL",
			"Produktkategorie",
			"Versandkosten Allgemein",
			"Versandkosten Vorkasse",
			"Versandkosten Nachnahme",
			"Versandkosten Kreditkarte",
			"Versandkosten Lastschrift",
			"Versandkosten Rechnung",
			"Versandkosten PayPal",
			"Versandkosten Sofortüberweisung",
			"Verfügbarkeit",
			"Lieferzeit",
			"Grundpreis",
			"Grundpreiseinheit",
			"Inhalt",
			"Produktbild-URL-#1",
			"Produktbild-URL-#2",
			"Produktbild-URL-#3",
			"Produktbild-URL-#4",
			"Produktbild-URL-#5",
		];

		// Sammle alle einzigartigen Metafeld-Keys
		const allMetafieldKeys = new Set();
		products.forEach((product) => {
			Object.keys(product.all_metafields || {}).forEach((key) => {
				allMetafieldKeys.add(key);
			});
		});

		const metafieldColumns = Array.from(allMetafieldKeys).sort();
		csv = [...csv, ...metafieldColumns].join(",") + "\n";

		// CSV-Zeilen generieren
		products.forEach((product) => {
			const row = [
				`"${product.link}"`,
				`"${product.title}"`,
				`"${product.description}"`,
				`"${product.description}"`,
				`"${product.compare_at_price || ""}"`,
				`"${product.price_brutto || ""}"`,
				`"${product.price_netto || ""}"`,
				`"EUR"`,
				`"${product.ean || ""}"`,
				`"${product.aan || ""}"`,
				`"${product.brand}"`,
				`"${product.aan || ""}"`,
				`"${product.product_image}"`,
				`"${product.preview_image}"`,
				`"${product.category}"`,
				`"${product.shipping_costs || ""}"`,
				`"${product.shipping_costs || ""}"`,
				`"${product.shipping_costs || ""}"`,
				`"${product.shipping_costs || ""}"`,
				`"${product.shipping_costs || ""}"`,
				`"${product.shipping_costs || ""}"`,
				`"${product.shipping_costs || ""}"`,
				`"${product.shipping_costs || ""}"`,
				`"${product.stock || ""}"`,
				`"${product.delivery_time || ""}"`,
				`""`,
				`""`,
				`""`,
			];

			// Füge Produktbilder hinzu
			if (product.images && product.images.length > 0) {
				product.images.forEach((image) => {
					row.push(`"${image}"`);
				});
				for (let i = product.images.length; i < 5; i++) {
					row.push(`""`);
				}
			} else {
				for (let i = 0; i < 5; i++) {
					row.push(`""`);
				}
			}

			// Füge alle Metafelder hinzu
			metafieldColumns.forEach((metafieldKey) => {
				let value = product.all_metafields?.[metafieldKey] || "";

				if (typeof value === "object" && value !== null) {
					value = JSON.stringify(value);
				}

				value = String(value).replace(/"/g, '""');
				row.push(`"${value}"`);
			});

			csv += row.join(",") + "\n";
		});

		return new NextResponse(csv, {
			status: 200,
			headers: {
				"Content-Type": "text/plain; charset=utf-8",
				"Content-Disposition": 'attachment; filename="products-export.csv"',
			},
		});
	} catch (error) {
		console.error("Error in GET request:", error);
		return new NextResponse(JSON.stringify({ error: error.message, stack: error.stack }), {
			status: 500,
			headers: {
				"Content-Type": "application/json",
			},
		});
	}
}
