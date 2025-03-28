import { NextResponse } from "next/server";
import shopifyServer from "@/lib/shopify.server.js";
import { parse } from "querystring";

const SHOPIFY_HOST_NAME = process.env.SHOPIFY_HOST_NAME;
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

export async function POST(req) {
	try {
		if (!SHOPIFY_HOST_NAME || !SHOPIFY_ADMIN_ACCESS_TOKEN) {
			return NextResponse.json({ error: "Missing Shopify credentials" }, { status: 500 });
		}

		// OCI-Daten empfangen
		const ociDataRaw = await req.text();

		// form-urlencoded String in ein Objekt parsen
		const ociDataParsed = parse(ociDataRaw);

		// OCI-Daten in das gewünschte Format umwandeln
		const item = {
			description: ociDataParsed["NEW_ITEM-DESCRIPTION[1]"],
			quantity: parseInt(ociDataParsed["NEW_ITEM-QUANTITY[1]"]) || 1,
			ean: ociDataParsed["NEW_ITEM-EGR_CUSTOMDATA_EAN[1]"]?.trim(),
			price: parseFloat(ociDataParsed["NEW_ITEM-PRICE[1]"]) || 0,
			longText: ociDataParsed["NEW_ITEM-LONGTEXT_1:132[]"],
			imageUrl: ociDataParsed["NEW_ITEM-ATTACHMENT[1]"],
		};
		console.log("Parsed Item:", item);

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
		// Produkt suchen (nach Titel oder EAN)
		let productData;
		const matchedProduct = products.find((product) => product.variants.some((variant) => variant.sku === item.ean));
		if (matchedProduct) {
			const matchedVariant = matchedProduct.variants.find((variant) => variant.sku === item.ean);
			productData = {
				productId: matchedProduct.id,
				variantId: matchedVariant.id,
				title: matchedProduct.title,
			};
			console.log("Produkt gefunden:", productData);
		} else {
			const newProduct = {
				product: {
					title: item.description,
					body_html: item.longText || item.description,
					variants: [
						{
							price: item.price.toFixed(2),
							sku: item.ean,
							inventory_management: "shopify",
							inventory_quantity: item.quantity,
						},
					],
					images: item.imageUrl ? [{ src: item.imageUrl }] : [],
				},
			};

			const createResponse = await adminRESTClient.post({
				path: "products.json",
				data: newProduct,
				type: "application/json",
			});
			const createdProduct = createResponse.body.product;

			productData = {
				productId: createdProduct.id,
				variantId: createdProduct.variants[0].id,
				title: createdProduct.title,
			};
			console.log("Produkt erstellt:", productData);
		}

		// Nachricht an das Parent-Window senden
		const message = {
			type: "productReady",
			message: "Produkt bereit zum Hinzufügen zum Warenkorb",
			product: productData,
		};

		const htmlResponse = `
		<script>
		  window.parent.postMessage(${JSON.stringify(message)}, "*");
		</script>
	  `;

		return new NextResponse(htmlResponse, {
			status: 200,
			headers: {
				"Content-Type": "text/html",
			},
		});
	} catch (error) {
		console.error("Error in GET request:", error);
		const errorHtml = `
		<script>
		  window.parent.postMessage({
			type: "error",
			message: "${error.message || "Fehler bei der Verarbeitung"}"
		  }, "*");
		</script>
	  `;
		return new NextResponse(errorHtml, {
			status: 200,
			headers: {
				"Content-Type": "text/html",
			},
		});
	}
}

export async function GET(req) {
	try {
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

		return NextResponse.json(products);
	} catch (error) {
		console.error("Error in GET request:", error);
		return NextResponse.json({ error: "Fehler bei der Verarbeitung" });
	}
}
