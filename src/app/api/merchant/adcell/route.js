import { NextResponse } from "next/server";
import shopifyServer from "@/lib/shopify.server.js";

const SHOPIFY_HOST_NAME = process.env.SHOPIFY_HOST_NAME;
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

const queryProducWithMetafields = async (session) => {
	let hasNextPage = true;
	let cursor = null;
	const allProducts = [];

	const graphqlClient = new shopifyServer.clients.Graphql({ session: session });

	while (hasNextPage) {
		const query = `
		query getProducts($cursor: String) {
			products(first: 100, after: $cursor) {
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
						variants(first: 100) {
							edges {
								node {
									id
									title
									price
									barcode
									sku
									availableForSale
									image {
										originalSrc
										altText
									}
								}
							}
						}
						metafieldLieferzeit: metafield(namespace: "custom", key: "lieferzeit") {
							value
						}
						metafieldVersandkosten: metafield(namespace: "custom", key: "versandkosten") {
							value
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
	}

	const response = [];
	allProducts.forEach((product) => {
		const variants = product.variants.edges.map((edge) => edge.node);
		const images = product.images.edges.map((edge) => edge.node.originalSrc);
		const metafields = {
			lieferzeit: product.metafieldLieferzeit ? product.metafieldLieferzeit.value : "",
			versandkosten: product.metafieldVersandkosten ? JSON.parse(product.metafieldVersandkosten.value) : "",
		};
		variants.forEach((variant) => {
			const gid = variant.id;
			const variantID = gid.split("/").pop();
			const brutto = parseFloat(variant.price);
			const mwst = 0.19; // 19 % MwSt
			const netto = +(brutto / (1 + mwst)).toFixed(2);
			const variantImage = variant.image?.originalSrc || images[0] || "";
			const time_to_deliver = parseInt(metafields.lieferzeit);
			const delivery_time = `${time_to_deliver - 1} - ${time_to_deliver + 1} Werktage`;
			response.push({
				title: product.title + (variant.title !== "Default Title" ? ` - ${variant.title}` : ""),
				description: product.bodyHtml,
				price_netto: netto,
				price_brutto: brutto,
				compare_at_price: variant.compare_at_price ? parseFloat(variant.compare_at_price) : null,
				currency: "EUR",
				aan: variant.sku,
				ean: variant.barcode,
				delivery_time: delivery_time,
				shipping_costs: metafields.versandkosten.amount,
				stock: variant.availableForSale ? "Auf Lager" : "Nicht auf Lager",
				category: product.productType,
				preview_image: variantImage,
				product_image: variantImage,
				images: images,
				brand: product.vendor,
				link: `https://erides.de/products/${product.handle}?variant=${variantID}`,
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

		let csv =
			[
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
			].join(",") + "\n";

		// CSV-Zeilen generieren
		const products = await queryProducWithMetafields(adminSession);
		products.forEach((product) => {
			csv += `"${product.link}","${product.title}","${product.description}","${product.description}","${
				product.compare_at_price || ""
			}","${product.price_brutto || ""}","${product.price_netto || ""}","EUR","${product.ean || ""}","${
				product.aan || ""
			}","${product.brand}","${product.aan || ""}","${product.product_image}","${product.preview_image}","${
				product.category
			}","${product.shipping_costs || ""}","${product.shipping_costs || ""}","${product.shipping_costs || ""}","${
				product.shipping_costs || ""
			}","${product.shipping_costs || ""}","${product.shipping_costs || ""}","${product.shipping_costs || ""}","${
				product.shipping_costs || ""
			}","${product.stock || ""}","${product.delivery_time || ""}","","",""`;

			// Füge Produktbilder hinzu
			if (product.images && product.images.length > 0) {
				product.images.forEach((image, index) => {
					csv += `,"${image}"`;
				});
			} else {
				csv += ',"","","","",""'; // Füge leere Felder hinzu, wenn keine Bilder vorhanden sind
			}
			csv += "\n";
		});

		return new NextResponse(csv, {
			status: 200,
			headers: {
				"Content-Type": "text/plain; charset=utf-8",
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
