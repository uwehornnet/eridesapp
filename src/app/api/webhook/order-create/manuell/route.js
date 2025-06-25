import { NextResponse } from "next/server";

const GA4_MEASUREMENT_ID = process.env.GA4_MEASUREMENT_ID;
const GA4_API_SECRET = process.env.GA4_API_SECRET;

async function sendToGA4WithRetry(payload) {
	const url = `https://www.google-analytics.com/mp/collect?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${GA4_API_SECRET}`;
	const res = await fetch(url, {
		method: "POST",
		body: JSON.stringify(payload),
		headers: { "Content-Type": "application/json" },
	});

	if (res.ok) {
		return {
			success: true,
			message: `GA4 tracking successful`,
			status: res.status,
			data: null,
		};
	} else {
		const errText = await res.text();
		console.warn(`GA4 Error: ${res.status} - ${errText}`);
		return {
			success: false,
			message: `GA4 Error: ${res.status} - ${errText}`,
			status: res.status,
			data: null,
		};
	}
}

export async function POST(req) {
	try {
		const rawBody = await req.text();

		// Danach JSON parsen
		const body = JSON.parse(rawBody);

		const tags = body.tags || [];
		if (!tags.includes("ga4")) {
			console.log("GA4 tag not found, skipping GA4 tracking.");
			return NextResponse.json({ success: true }, { status: 200 });
		}

		const value = parseFloat(body.subtotal_price || 0);
		const currency = body.currency || "EUR";
		const order_id = body.id;
		const clientIdAttr = body.note_attributes?.find((attr) => attr.name === "ga_client_id");
		const clientId = clientIdAttr ? clientIdAttr.value : "555";

		const payload = {
			client_id: `${clientId}`,
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
		const { success, message, status, data } = await sendToGA4WithRetry(payload);

		if (!success) {
			console.error("GA4 tracking failed after retries.");
			return NextResponse.json({ error: "GA4 failed after retries" }, { status: 500 });
		}

		console.log(message, status, data);

		return NextResponse.json({ success: true }, { status: 200 });
	} catch (error) {
		console.error("Webhook Fehler:", error);
		return new NextResponse(error.message, {
			status: 500,
			headers: { "Content-Type": "text/plain" },
		});
	}
}
