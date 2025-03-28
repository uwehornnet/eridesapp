import "@shopify/shopify-api/adapters/node"; // Node.js-Adapter
import { shopifyApi, LATEST_API_VERSION } from "@shopify/shopify-api";
import dotenv from "dotenv";

dotenv.config();

const shopifyServer = shopifyApi({
	apiKey: process.env.SHOPIFY_API_KEY,
	apiSecretKey: process.env.SHOPIFY_API_SECRET,
	scopes: process.env.SHOPIFY_API_SCOPES
		? process.env.SHOPIFY_API_SCOPES.split(",")
		: ["write_products", "read_products", "read_cart", "write_cart", "unauthenticated_write_carts"],
	hostName: process.env.SHOPIFY_HOST_NAME,
	apiVersion: LATEST_API_VERSION,
	isEmbeddedApp: false,
});

export default shopifyServer;
