import { NextResponse } from "next/server";
import shopifyServer from "@/lib/shopify.server.js";

const SHOPIFY_HOST_NAME = process.env.SHOPIFY_HOST_NAME;
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

// Funktion zum Abrufen aller Metafelder eines Namespace
async function getAllMetafields(client) {
	const query = `query {
    metafieldDefinitions(first: 250, ownerType: PRODUCT, constraintStatus: UNCONSTRAINED_ONLY) {
        edges {
            node {
                    id,
                    name,
                    namespace,
                    key,
                    ownerType             
                }
            }
        }
    }`;

	const response = await client.request(query);
	if (response?.data?.metafieldDefinitions?.edges) {
		return response.data.metafieldDefinitions.edges
			.filter((edge) => edge.node.namespace === "custom")
			.map((edge) => ({
				id: edge.node.id,
				name: edge.node.name,
				namespace: edge.node.namespace,
			}));
	}
	if (response?.errors) {
		console.error("GraphQL errors:", response.errors);
		throw new Error("Failed to fetch metafields");
	}
	return [];
}

// Funktion zum Löschen von Metafeldern
async function deleteMetafields(client, metafields) {
	const query = `mutation DeleteMetafieldDefinition($id: ID!, $deleteAllAssociatedMetafields: Boolean!) {
      metafieldDefinitionDelete(id: $id, deleteAllAssociatedMetafields: $deleteAllAssociatedMetafields) {
        deletedDefinitionId
        userErrors {
          field
          message
          code
        }
      }
    }`;

	const deletionPromises = metafields.map((metafield) => {
		const variables = {
			id: metafield.id,
			deleteAllAssociatedMetafields: true,
		};
		return client.request(query, { variables });
	});
	const deletionResults = await Promise.all(deletionPromises);
	const deletedMetafields = [];
	const userErrors = [];

	deletionResults.forEach((result, index) => {
		if (result?.data?.metafieldDefinitionDelete?.deletedDefinitionId) {
			deletedMetafields.push(metafields[index]);
		} else if (result?.data?.metafieldDefinitionDelete?.userErrors) {
			userErrors.push(...result.data.metafieldDefinitionDelete.userErrors);
		}
	});
	return {
		deletedMetafields,
		userErrors,
	};
}

// Haupt-GET-Handler
export async function GET() {
	try {
		if (!SHOPIFY_HOST_NAME || !SHOPIFY_ADMIN_ACCESS_TOKEN) {
			return NextResponse.json({ error: "Missing Shopify credentials" }, { status: 500 });
		}

		const adminSession = {
			shop: SHOPIFY_HOST_NAME,
			accessToken: SHOPIFY_ADMIN_ACCESS_TOKEN,
		};

		const client = new shopifyServer.clients.Graphql({
			session: adminSession,
		});

		const metafields = await getAllMetafields(client);
		if (!metafields.length) {
			return NextResponse.json({ message: "No metafields found in namespace 'custom'" }, { status: 200 });
		}

		let deletionResults = null;
		if (metafields.length > 0) {
			deletionResults = await deleteMetafields(
				client,
				metafields.filter((metafield) => {
					const names = [
						"3D Viewer",
						"Produktdetails",
						"Themed Galerie",
						"Produkt Features",
						"Konfigurator URL",
						"Datenblätter",
					];

					return !names.includes(metafield.name);
				})
			);
			if (deletionResults.userErrors && deletionResults.userErrors.length > 0) {
				return NextResponse.json(
					{ error: "Failed to delete metafields", userErrors: deletionResults.userErrors },
					{ status: 500 }
				);
			}
		}

		return NextResponse.json(
			{
				message: "Orphaned metafields processed",
				totalMetafields: metafields.length,
				deleted: deletionResults?.deletedMetafields || [],
			},
			{ status: 200 }
		);
	} catch (error) {
		console.error("Error in GET request:", error);
		return new NextResponse(error.message, {
			status: 500,
			headers: { "Content-Type": "text/html" },
		});
	}
}
