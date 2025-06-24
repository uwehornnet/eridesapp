import { NextResponse } from "next/server";
import shopifyServer from "@/lib/shopify.server.js";

const SHOPIFY_HOST_NAME = process.env.SHOPIFY_HOST_NAME;
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

// Mapping für Google Produktkategorien
const categoryMap = {
	Tische: "6362", // Furniture > Tables
	Sitzmöbel: "6356", // Furniture > Chairs (oder 436 für Sofas)
	Seniorenmöbel: "6356", // Furniture > Chairs (keine spezifische Kategorie)
	Möbel: "635", // Furniture (allgemein)
	"Lampen und Leuchten": "419", // Home & Garden > Lighting > Lamps
	Betten: "291", // Furniture > Beds & Accessories > Beds & Bed Frames
	Teppiche: "696", // Home & Garden > Decor > Rugs
};



export async function GET(request) {
	try {
		if (!SHOPIFY_HOST_NAME || !SHOPIFY_ADMIN_ACCESS_TOKEN) {
			return NextResponse.json({ error: "Missing Shopify credentials" }, { status: 500 });
		}

		const url = new URL(request.url);
		const type = url.searchParams.get("type");

		const adminSession = {
			shop: SHOPIFY_HOST_NAME,
			accessToken: SHOPIFY_ADMIN_ACCESS_TOKEN,
		};

		const adminRESTClient = new shopifyServer.clients.Rest({ session: adminSession });

		const productResponse = await adminRESTClient.get({
			path: "products.json",
			query: {
				fields: "id,title,handle,variants,images,description,vendor,product_type,status",
			},
		});
		const products = productResponse.body.products;

		// XML-Feed
		if (type === "xml") {
			let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
			xml += '<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">\n';
			xml += "  <channel>\n";

			products.forEach((product) => {
				const itemGroupId = product.id;
				const productLink = `${SHOPIFY_HOST_NAME}/products/${product.handle}`;
				const googleCategory = categoryMap[product.product_type] || "635"; // Fallback: Furniture

				product.variants.forEach((variant) => {
					const availability =
						variant.inventory_quantity > 0 && product.status === "active" ? "in stock" : "out of stock";

					xml += "    <item>\n";
					xml += `      <g:id>${variant.id}</g:id>\n`;
					xml += `      <g:item_group_id>${itemGroupId}</g:item_group_id>\n`;
					xml += `      <title>${escapeXml(
						product.title + (variant.title !== "Default Title" ? ` - ${variant.title}` : "")
					)}</title>\n`;
					xml += `      <description>${escapeXml(
						product.description || "Keine Beschreibung verfügbar"
					)}</description>\n`;
					xml += `      <g:price>${variant.price} ${variant.currency || "EUR"}</g:price>\n`;
					xml += `      <g:availability>${availability}</g:availability>\n`;
					xml += `      <g:condition>new</g:condition>\n`;
					xml += `      <g:image_link>${
						product.images[0]?.src || "https://via.placeholder.com/150"
					}</g:image_link>\n`;
					xml += `      <link>${productLink}?variant=${variant.id}</link>\n`;
					xml += `      <g:brand>${escapeXml(product.vendor || "Unbekannt")}</g:brand>\n`;
					xml += `      <g:google_product_category>${googleCategory}</g:google_product_category>\n`;
					if (variant.barcode) xml += `      <g:gtin>${variant.barcode}</g:gtin>\n`;

					// Kategorie-spezifische Attribute
					if (variant.option1) xml += `      <g:size>${escapeXml(variant.option1)}</g:size>\n`; // Größe (Pflicht für Betten/Teppiche)
					if (variant.option2) xml += `      <g:color>${escapeXml(variant.option2)}</g:color>\n`; // Farbe
					if (variant.option3 && product.product_type === "Teppiche") {
						xml += `      <g:pattern>${escapeXml(variant.option3)}</g:pattern>\n`; // Muster für Teppiche
					}
					if (product.product_type.includes("Lampen") && variant.wattage) {
						xml += `      <g:wattage>${escapeXml(variant.wattage)}</g:wattage>\n`; // Wattzahl für Lampen
					}
					// Material könnte aus Metafeldern kommen; hier als Platzhalter
					if (variant.material) xml += `      <g:material>${escapeXml(variant.material)}</g:material>\n`;

					xml += "    </item>\n";
				});
			});

			xml += "  </channel>\n";
			xml += "</rss>";

			return new NextResponse(xml, {
				status: 200,
				headers: {
					"Content-Type": "application/xml",
				},
			});
		}

		// JSON-Feed (Google Merchant Feed kompatibel)
		if (type === "json") {
			const googleFeed = products.flatMap((product) => {
				const itemGroupId = product.id;
				const productLink = `${SHOPIFY_HOST_NAME}/products/${product.handle}`;
				const googleCategory = categoryMap[product.product_type] || "635";

				return product.variants.map((variant) => {
					const availability =
						variant.inventory_quantity > 0 && product.status === "active" ? "inStock" : "outOfStock";

					const item = {
						offerId: variant.id.toString(),
						title: product.title + (variant.title !== "Default Title" ? ` - ${variant.title}` : ""),
						description: product.description || "Keine Beschreibung verfügbar",
						link: `${productLink}?variant=${variant.id}`,
						imageLink: product.images[0]?.src || "https://via.placeholder.com/150",
						price: {
							value: variant.price,
							currency: variant.currency || "EUR",
						},
						availability: availability,
						condition: "new",
						brand: product.vendor || "Unbekannt",
						googleProductCategory: googleCategory,
						itemGroupId: itemGroupId.toString(),
					};

					// Kategorie-spezifische Attribute
					if (variant.barcode) item.gtin = variant.barcode;
					if (variant.option1) item.size = variant.option1; // Größe (Pflicht für Betten/Teppiche)
					if (variant.option2) item.color = variant.option2; // Farbe
					if (variant.option3 && product.product_type === "Teppiche") {
						item.pattern = variant.option3; // Muster für Teppiche
					}
					if (product.product_type.includes("Lampen") && variant.wattage) {
						item.wattage = variant.wattage; // Wattzahl für Lampen
					}
					if (variant.material) item.material = variant.material; // Material

					return item;
				});
			});

			return new NextResponse(JSON.stringify(googleFeed), {
				status: 200,
				headers: {
					"Content-Type": "application/json",
				},
			});
		}

		// Standard: Rohdaten als JSON
		return new NextResponse(JSON.stringify(products), {
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

function escapeXml(unsafe) {
	if (!unsafe) return "";
	return unsafe
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}
