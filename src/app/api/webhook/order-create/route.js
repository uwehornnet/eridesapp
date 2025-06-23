import { NextResponse } from "next/server";

const GA4_MEASUREMENT_ID = process.env.GA4_MEASUREMENT_ID;
const GA4_API_SECRET = process.env.GA4_API_SECRET;

async function sendToGA4WithRetry(payload, maxRetries = 3, delayMs = 1000) {
	const url = `https://www.google-analytics.com/mp/collect?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${GA4_API_SECRET}`;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			const res = await fetch(url, {
				method: "POST",
				body: JSON.stringify(payload),
				headers: { "Content-Type": "application/json" },
			});

			if (res.ok) {
				return true; // success
			} else {
				const errText = await res.text();
				console.warn(`GA4 Error (Attempt ${attempt}): ${res.status} - ${errText}`);
			}
		} catch (err) {
			console.warn(`GA4 Network Error (Attempt ${attempt}):`, err.message);
		}

		// Verzögerung vor erneutem Versuch
		if (attempt < maxRetries) {
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}

	return false; // alle Versuche fehlgeschlagen
}

export async function POST(request) {
	try {
		const body = await request.json();

		const clientIdAttr = body.note_attributes?.find((attr) => attr.name === "_ga");
		const client_id = clientIdAttr?.value || "555"; // Fallback auf '555', wenn kein _ga Wert vorhanden ist

		if (!client_id) {
			console.warn("Kein _ga client_id vorhanden, überspringe Tracking.");
			return NextResponse.json({ status: "no_client_id" }, { status: 200 });
		}

		const value = parseFloat(body.total_price || 0);
		const currency = body.currency || "EUR";
		const order_id = body.id;

		const payload = {
			client_id: client_id,
			events: [
				{
					name: "purchase",
					params: {
						transaction_id: order_id.toString(),
						value: value,
						currency: currency,
						items: body.line_items.map((item) => ({
							item_name: item.title,
							price: parseFloat(item.price),
							quantity: item.quantity,
						})),
					},
				},
			],
		};

		console.log("GA4 Payload:", JSON.stringify(payload, null, 2));
		const success = await sendToGA4WithRetry(payload);

		if (!success) {
			console.error("GA4 tracking failed after retries.");
			return NextResponse.json({ error: "GA4 failed after retries" }, { status: 500 });
		}
	} catch (error) {
		console.error("Webhook Fehler:", error);
		return new NextResponse(error.message, {
			status: 500,
			headers: { "Content-Type": "text/plain" },
		});
	}
}
