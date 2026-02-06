import { NextResponse } from "next/server";
import shopifyServer from "@/lib/shopify.server.js";

const SHOPIFY_HOST_NAME = process.env.SHOPIFY_HOST_NAME;
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const SHOP_DOMAIN = "https://erides.de";
const CURRENCY = "EUR";

function escapeXml(str) {
	if (!str) return "";
	return String(str)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

function stripHtml(html) {
	if (!html) return "";
	return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function getAvailability(variant, productStatus) {
	if (productStatus !== "active") return "out_of_stock";
	if (variant.inventory_management === null) return "in_stock";
	return variant.inventory_quantity > 0 ? "in_stock" : "out_of_stock";
}

function getVariantOptionByName(product, variant, optionName) {
	const option = product.options?.find(
		(o) => o.name.toLowerCase() === optionName.toLowerCase()
	);
	if (!option) return null;
	return variant[`option${option.position}`] || null;
}

function buildItemXml(product, variant) {
	const variantId = variant.sku || `shopify_${product.id}_${variant.id}`;
	const title = variant.title !== "Default Title"
		? `${product.title} - ${variant.title}`
		: product.title;
	const description = stripHtml(product.body_html);
	const link = `${SHOP_DOMAIN}/products/${product.handle}`;
	const imageLink = product.images?.[0]?.src || "";
	const price = `${parseFloat(variant.price).toFixed(2)} ${CURRENCY}`;
	const availability = getAvailability(variant, product.status);
	const brand = product.vendor || "";
	const barcode = variant.barcode || "";
	const productType = product.product_type || "";

	const color = getVariantOptionByName(product, variant, "Color")
		|| getVariantOptionByName(product, variant, "Farbe");
	const size = getVariantOptionByName(product, variant, "Size")
		|| getVariantOptionByName(product, variant, "Größe");
	const material = getVariantOptionByName(product, variant, "Material");

	const salePrice = variant.compare_at_price && parseFloat(variant.compare_at_price) > parseFloat(variant.price)
		? `${parseFloat(variant.price).toFixed(2)} ${CURRENCY}`
		: null;
	const regularPrice = salePrice
		? `${parseFloat(variant.compare_at_price).toFixed(2)} ${CURRENCY}`
		: price;

	const additionalImages = product.images?.slice(1) || [];

	const weight = variant.weight && variant.weight > 0
		? `${variant.weight} ${variant.weight_unit || "kg"}`
		: null;

	let xml = `    <item>
      <g:id>${escapeXml(variantId)}</g:id>
      <g:title>${escapeXml(title)}</g:title>
      <g:description>${escapeXml(description)}</g:description>
      <g:link>${escapeXml(link)}</g:link>
      <g:image_link>${escapeXml(imageLink)}</g:image_link>
      <g:availability>${availability}</g:availability>
      <g:price>${escapeXml(regularPrice)}</g:price>
      <g:brand>${escapeXml(brand)}</g:brand>
      <g:condition>new</g:condition>
      <g:item_group_id>${product.id}</g:item_group_id>`;

	if (salePrice) {
		xml += `\n      <g:sale_price>${escapeXml(salePrice)}</g:sale_price>`;
	}

	if (barcode) {
		xml += `\n      <g:gtin>${escapeXml(barcode)}</g:gtin>`;
	} else {
		xml += `\n      <g:identifier_exists>false</g:identifier_exists>`;
	}

	if (productType) {
		xml += `\n      <g:product_type>${escapeXml(productType)}</g:product_type>`;
	}

	if (color) {
		xml += `\n      <g:color>${escapeXml(color)}</g:color>`;
	}
	if (size) {
		xml += `\n      <g:size>${escapeXml(size)}</g:size>`;
	}
	if (material) {
		xml += `\n      <g:material>${escapeXml(material)}</g:material>`;
	}
	if (weight) {
		xml += `\n      <g:shipping_weight>${escapeXml(weight)}</g:shipping_weight>`;
	}

	for (const img of additionalImages) {
		xml += `\n      <g:additional_image_link>${escapeXml(img.src)}</g:additional_image_link>`;
	}

	xml += `\n    </item>`;
	return xml;
}

async function fetchAllProducts(adminRESTClient) {
	let products = [];
	let params = {
		path: "products.json",
		query: {
			fields: "id,title,handle,variants,images,body_html,vendor,product_type,status,options,tags",
			limit: "250",
		},
	};

	let response = await adminRESTClient.get(params);
	products = products.concat(response.body.products);

	while (response.pageInfo?.nextPage) {
		response = await adminRESTClient.get({
			path: "products.json",
			query: response.pageInfo.nextPage.query,
		});
		products = products.concat(response.body.products);
	}

	return products;
}

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
		const products = await fetchAllProducts(adminRESTClient);

		const items = products
			.filter((p) => p.status === "active")
			.flatMap((product) =>
				product.variants.map((variant) => buildItemXml(product, variant))
			);

		const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>LunaGlow Google Shopping Feed</title>
    <link>${SHOP_DOMAIN}</link>
    <description>Google Merchant Center Product Feed</description>
${items.join("\n")}
  </channel>
</rss>`;

		return new NextResponse(xml, {
			status: 200,
			headers: {
				"Content-Type": "application/xml; charset=utf-8",
			},
		});
	} catch (error) {
		console.error("Error generating Google Merchant feed:", error);
		return new NextResponse(`<?xml version="1.0"?><error>${escapeXml(error.message)}</error>`, {
			status: 500,
			headers: {
				"Content-Type": "application/xml",
			},
		});
	}
}
