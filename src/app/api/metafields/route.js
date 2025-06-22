import { NextResponse } from "next/server";
import shopifyServer from "@/lib/shopify.server.js";

const SHOPIFY_HOST_NAME = process.env.SHOPIFY_HOST_NAME;
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

// Kategorien mit ihren IDs
const categoryMap = {
	Tisch: "gid://shopify/TaxonomyCategory/fr-24",
	Stuhl: "gid://shopify/TaxonomyCategory/fr-7",
	Betten_Zubehoer: "gid://shopify/TaxonomyCategory/fr-2",
	Schraenke: "gid://shopify/TaxonomyCategory/fr-4",
	Moebel: "gid://shopify/TaxonomyCategory/fr",
	Lampen: "gid://shopify/TaxonomyCategory/hg-13",
	Teppiche: "gid://shopify/TaxonomyCategory/hg-3-57",
};

// Metafield-Definitionen für jede Kategorie
const metafieldDefinitions = {
	Tisch: [
		{ name: "Material Gestell", key: "material_gestell", type: "single_line_text_field" },
		{ name: "Material Tischplatte", key: "material_tischplatte", type: "single_line_text_field" },
		{ name: "Farbe Gestell", key: "farbe_gestell", type: "single_line_text_field" },
		{ name: "Farbe Tischplatte", key: "farbe_tischplatte", type: "single_line_text_field" },
		{ name: "Bauform Tischplatte", key: "bauform_tischplatte", type: "single_line_text_field" },
		{ name: "Stärke Tischplatte", key: "staerke_tischplatte", type: "number_decimal" },
		{ name: "Dekor", key: "dekor", type: "single_line_text_field" },
		{ name: "Oberfläche", key: "oberflaeche", type: "single_line_text_field" },
		{ name: "Höhenverstellbar", key: "hoehenverstellbar", type: "single_line_text_field" },
		{ name: "Höhenverstellbar max in cm", key: "hoehenverstellbar_max", type: "number_decimal" },
		{ name: "Höhenverstellbar min in cm", key: "hoehenverstellbar_min", type: "number_decimal" },
		{ name: "Besonderheit", key: "besonderheit", type: "single_line_text_field" },
		{ name: "Ausziehbar", key: "ausziehbar", type: "single_line_text_field" },
		{ name: "Ausziehbar max in cm", key: "ausziehbar_max", type: "number_decimal" },
		{ name: "Füße", key: "legs", type: "single_line_text_field" },
		{ name: "Schubfach", key: "schubfach", type: "single_line_text_field" },
		{ name: "Schubfach Anzahl", key: "schubfach_anzahl", type: "single_line_text_field" },
		{ name: "Material Gestell", key: "material_gestell", type: "single_line_text_field" },
		{ name: "Material Sitzflaeche", key: "material_sitzflaeche", type: "single_line_text_field" },
		{ name: "Material Rueckenlehne", key: "material_rueckenlehne", type: "single_line_text_field" },
		{ name: "Material Armlehne", key: "material_armlehne", type: "single_line_text_field" },
		{ name: "Materialeigenschaften", key: "materialeigenschaften", type: "single_line_text_field" },
		{ name: "Farbe Gestell", key: "farbe_gestell", type: "single_line_text_field" },
		{ name: "Farbe Sitzflaeche", key: "farbe_sitzflaeche", type: "single_line_text_field" },
		{ name: "Hoehe Sitzflaeche", key: "hoehe_sitzflaeche", type: "number_decimal" },
		{ name: "Hoehe Sitzmoebel", key: "hoehe_sitzmoebel", type: "number_decimal" },
		{ name: "Breite Sitzmoebel", key: "breite_sitzmoebel", type: "number_decimal" },
		{ name: "Tiefe Sitzmoebel", key: "tiefe_sitzmoebel", type: "number_decimal" },
		{ name: "Durchmesser Sitzflaeche", key: "durchmesser_sitzflaeche", type: "number_decimal" },
		{ name: "Bauform Sitzmoebel", key: "bauform_sitzmoebel", type: "single_line_text_field" },
		{ name: "Oberflaeche", key: "oberflaeche", type: "single_line_text_field" },
		{ name: "Ruecklehnenverstellbarkeit", key: "ruecklehnenverstellbarkeit", type: "single_line_text_field" },
		{ name: "Hoehenverstellbar Sitz", key: "hoehenverstellbar_sitz", type: "single_line_text_field" },
		{ name: "Hoehenverstellbar max", key: "hoehenverstellbar_max", type: "number_decimal" },
		{ name: "Hoehenverstellbar min", key: "hoehenverstellbar_min", type: "number_decimal" },
		{ name: "Besonderheit Sitzmoebel", key: "besonderheit_sitzmoebel", type: "single_line_text_field" },
		{ name: "Bodengleiter", key: "bodengleiter", type: "single_line_text_field" },
		{ name: "Stappelbar", key: "stappelbar", type: "single_line_text_field" },
		{ name: "Aufstehhilfe", key: "aufstehhilfe", type: "single_line_text_field" },
		{ name: "Belastbar", key: "belastbar", type: "number_decimal" },
		{ name: "Rollen", key: "rollen", type: "single_line_text_field" },
		{ name: "Anzahl Sitze", key: "anzahl_sitze", type: "number_integer" },
		{ name: "Stoffzusammensetzung", key: "stoffzusammensetzung", type: "single_line_text_field" },
		{ name: "Material Bett", key: "material_bett", type: "single_line_text_field" },
		{ name: "Material Matratze", key: "material_matratze", type: "single_line_text_field" },
		{ name: "Stoffzusammensetzung", key: "stoffzusammensetzung", type: "single_line_text_field" },
		{ name: "Farbe Matratze", key: "farbe_matratze", type: "single_line_text_field" },
		{ name: "Farbe Bett", key: "farbe_bett", type: "single_line_text_field" },
		{ name: "Farbe 2 Bett", key: "farbe_2_bett", type: "single_line_text_field" },
		{ name: "Hoehe Bett Kopfteil", key: "hoehe_bett_kopfteil", type: "number_decimal" },
		{ name: "Hoehe Bett Fussteil", key: "hoehe_bett_fussteil", type: "number_decimal" },
		{ name: "Breite Bett", key: "breite_bett", type: "number_decimal" },
		{ name: "Tiefe Bett", key: "tiefe_bett", type: "number_decimal" },
		{ name: "Bodenfreiheit Bett", key: "bodenfreiheit_bett", type: "number_decimal" },
		{ name: "Einstiegshoehe", key: "einstiegshoehe", type: "number_decimal" },
		{ name: "Einlegetiefe Lattenrost", key: "einlegetiefe_lattenrost", type: "number_decimal" },
		{ name: "Bauform Bett", key: "bauform_bett", type: "single_line_text_field" },
		{ name: "Oberflaeche", key: "oberflaeche", type: "single_line_text_field" },
		{ name: "Besonderheit", key: "besonderheit", type: "single_line_text_field" },
		{ name: "Lattenrost", key: "lattenrost", type: "single_line_text_field" },
		{ name: "Matratze", key: "matratze", type: "single_line_text_field" },
		{ name: "Ausziehbares", key: "ausziehbares", type: "single_line_text_field" },
		{ name: "Material Schrank", key: "material_schrank", type: "single_line_text_field" },
		{ name: "Farbe Schrank", key: "farbe_schrank", type: "single_line_text_field" },
		{ name: "Farbe 2 Schrank", key: "farbe_2_schrank", type: "single_line_text_field" },
		{ name: "Hoehe Schrank", key: "hoehe_schrank", type: "number_decimal" },
		{ name: "Breite Schrank", key: "breite_schrank", type: "number_decimal" },
		{ name: "Tiefe Schrank", key: "tiefe_schrank", type: "number_decimal" },
		{ name: "Bauform Schrank", key: "bauform_schrank", type: "single_line_text_field" },
		{ name: "Oberflaeche", key: "oberflaeche", type: "single_line_text_field" },
		{ name: "Besonderheit Schrank", key: "besonderheit_schrank", type: "single_line_text_field" },
		{ name: "Tueren", key: "tueren", type: "number_integer" },
		{ name: "Ausziehbares", key: "ausziehbares", type: "number_integer" },
		{ name: "Faecher", key: "faecher", type: "number_integer" },
		{ name: "Rollen", key: "rollen", type: "single_line_text_field" },
		{ name: "Material Basis", key: "material_basis", type: "single Divinity_line_text_field" },
		{ name: "Material Schirm", key: "material_schirm", type: "single_line_text_field" },
		{ name: "Farbe Basis", key: "farbe_basis", type: "single_line_text_field" },
		{ name: "Farbe Lampenschirm", key: "farbe_lampenschirm", type: "single_line_text_field" },
		{ name: "Tiefe Lampe", key: "tiefe_lampe", type: "number_decimal" },
		{ name: "Hoehe Lampe", key: "hoehe_lampe", type: "number_decimal" },
		{ name: "Breite Lampe", key: "breite_lampe", type: "number_decimal" },
		{ name: "Durchmesser Lampe Basis", key: "durchmesser_lampe_basis", type: "number_decimal" },
		{ name: "Durchmesser Lampenschirm oben", key: "durchmesser_lampenschirm_oben", type: "number_decimal" },
		{ name: "Durchmesser Lampenschirm unten", key: "durchmesser_lampenschirm_unten", type: "number_decimal" },
		{ name: "Hoehe Lampenschirm", key: "hoehe_lampenschirm", type: "number_decimal" },
		{ name: "Einaumasse", key: "einaumasse", type: "number_decimal" },
		{ name: "Einbautiefe", key: "einbautiefe", type: "number_decimal" },
		{ name: "Bauform Lampe", key: "bauform_lampe", type: "single_line_text_field" },
		{ name: "Oberflaeche", key: "oberflaeche", type: "single_line_text_field" },
		{ name: "Hoehenverstellbar", key: "hoehenverstellbar", type: "single_line_text_field" },
		{ name: "Hoehenverstellbar max", key: "hoehenverstellbar_max", type: "number_decimal" },
		{ name: "Hoehenverstellbar min", key: "hoehenverstellbar_min", type: "number_decimal" },
		{ name: "Besonderheit Leuchten", key: "besonderheit_leuchten", type: "single_line_text_field" },
		{ name: "Dimmbarkeit", key: "dimmbarkeit", type: "single_line_text_field" },
		{ name: "Dimmer Art", key: "dimmer_art", type: "single_line_text_field" },
		{ name: "Lichtquelle", key: "lichtquelle", type: "single_line_text_field" },
		{ name: "Lichtquelle Art", key: "lichtquelle_art", type: "single_line_text_field" },
		{ name: "Lumen", key: "lumen", type: "number_integer" },
		{ name: "Leistung", key: "leistung", type: "number_decimal" },
		{ name: "Anzahl der Lichtquellen", key: "anzahl_lichtquellen", type: "number_integer" },
		{ name: "EEC", key: "eec", type: "single_line_text_field" },
		{ name: "EEC-Specktrum", key: "eec_specktrum", type: "single_line_text_field" },
		{ name: "Fassung", key: "fassung", type: "single_line_text_field" },
		{ name: "Lichtfarbe", key: "lichtfarbe", type: "single_line_text_field" },
		{ name: "Lichfarbwert", key: "lichfarbwert", type: "number_integer" },
		{ name: "Schutzart", key: "schutzart", type: "single_line_text_field" },
		{ name: "Schutzklasse", key: "schutzklasse", type: "single_line_text_field" },
		{ name: "Lebensdauer", key: "lebensdauer", type: "number_integer" },
		{ name: "Anschluss", key: "anschluss", type: "single_line_text_field" },
		{ name: "Schalter", key: "schalter", type: "single_line_text_field" },
		{ name: "Schalter Art", key: "schalter_art", type: "single_line_text_field" },
		{ name: "Smarthome", key: "smarthome", type: "single_line_text_field" },
		{ name: "Smarthome Art", key: "smarthome_art", type: "single_line_text_field" },
		{ name: "Befahrbarkeit", key: "befahrbarkeit", type: "single_line_text_field" },
		{ name: "Belastung", key: "belastung", type: "number_decimal" },
		{ name: "Material Stoff", key: "material_stoff", type: "single_line_text_field" },
		{ name: "Farbe Stoff", key: "farbe_stoff", type: "single_line_text_field" },
		{ name: "Breite Stoff", key: "breite_stoff", type: "number_decimal" },
		{ name: "Laenge Stoff", key: "laenge_stoff", type: "number_decimal" },
		{ name: "Dicke Stoff", key: "dicke_stoff", type: "number_decimal" },
		{ name: "Durchmesser Stoff", key: "durchmesser_stoff", type: "number_decimal" },
		{ name: "Bauform Stoff", key: "bauform_stoff", type: "single_line_text_field" },
		{ name: "Oberflaeche Stoff", key: "oberflaeche_stoff", type: "single_line_text_field" },
		{ name: "Besonderheit Stoff", key: "besonderheit_stoff", type: "single_line_text_field" },
		{ name: "Belastbar", key: "belastbar", type: "number_decimal" },
		{ name: "Lieferumfang", key: "lieferumfang", type: "single_line_text_field" },
		{ name: "Fuellung", key: "fuellung", type: "single_line_text_field" },
		{ name: "Stoffzusammensetzung", key: "stoffzusammensetzung", type: "single_line_text_field" },
	],
	Stuhl: [],
	Betten_Zubehoer: [],
	Schraenke: [],
	Lampen: [],
	Teppiche: [],
};

const generalMetafieldDefinitions = [
	{ name: "Marge", key: "marge", type: "number_decimal" },
	{ name: "Marktplatz-Preis", key: "marktplatz_preis", type: "number_decimal" },
	{ name: "Lieferzeit", key: "lieferzeit", type: "single_line_text_field" },
	{ name: "Lieferzeit Vorbesteller", key: "lieferzeit_vorbesteller", type: "single_line_text_field" },
	{ name: "Marke", key: "marke", type: "single_line_text_field" },
	{ name: "Hersteller", key: "hersteller", type: "single_line_text_field" },
	{
		name: "Hersteller Adresse mit elektronischer Adresse",
		key: "hersteller_adresse_mit_elektronischer_adresse",
		type: "multi_line_text_field",
	},
	{ name: "Hersteller Strasse", key: "hersteller_strasse", type: "single_line_text_field" },
	{ name: "Hersteller Ort", key: "hersteller_ort", type: "single_line_text_field" },
	{ name: "Hersteller PLZ", key: "hersteller_plz", type: "single_line_text_field" },
	{ name: "Hersteller Land", key: "hersteller_land", type: "single_line_text_field" },
	{ name: "Hersteller Land ISO-3", key: "hersteller_land_iso3", type: "single_line_text_field" },
	{
		name: "Hersteller Elektronische Adresse",
		key: "hersteller_elektronische_adresse",
		type: "single_line_text_field",
	},
	{
		name: "Hersteller Verantwortlicher ausserhalb der EU",
		key: "hersteller_verantwortlicher_ausserhalb_eu",
		type: "single_line_text_field",
	},
	{ name: "GPSR Sicherheitsrichtlinien", key: "gpsr_sicherheitsrichtlinien", type: "multi_line_text_field" },
	{ name: "GPSR Bedienungsanleitung", key: "gpsr_bedienungsanleitung", type: "multi_line_text_field" },
	{ name: "GPSR Zertifikate", key: "gpsr_zertifikate", type: "multi_line_text_field" },
	{
		name: "GPSR Sicherheitsrichtlinien Text",
		key: "gpsr_sicherheitsrichtlinien_text",
		type: "multi_line_text_field",
	},
	{ name: "Produktart", key: "produktart", type: "single_line_text_field" },
	{ name: "Produktserie", key: "produktserie", type: "single_line_text_field" },
	{ name: "Verwendungsort", key: "verwendungsort", type: "single_line_text_field" },
	{ name: "Verwendungsraum", key: "verwendungsraum", type: "single_line_text_field" },
	{ name: "Hinweis Batteriegesetz", key: "hinweis_batteriegesetz", type: "multi_line_text_field" },
	{ name: "Hinweis Entsorgung", key: "hinweis_entsorgung", type: "multi_line_text_field" },
	{ name: "Material Gestell", key: "material_gestell", type: "single_line_text_field" },
	{ name: "Material Tischplatte", key: "material_tischplatte", type: "single_line_text_field" },
	{ name: "Farbe Gestell", key: "farbe_gestell", type: "single_line_text_field" },
	{ name: "Farbe Tischplatte", key: "farbe_tischplatte", type: "single_line_text_field" },
	{ name: "Bauform Tischplatte", key: "bauform_tischplatte", type: "single_line_text_field" },
	{ name: "Stärke Tischplatte", key: "staerke_tischplatte", type: "number_decimal" },
	{ name: "Dekor", key: "dekor", type: "single_line_text_field" },
	{ name: "Oberfläche", key: "oberflaeche", type: "single_line_text_field" },
	{ name: "Höhenverstellbar", key: "hoehenverstellbar", type: "single_line_text_field" },
	{ name: "Höhenverstellbar max in cm", key: "hoehenverstellbar_max", type: "number_decimal" },
	{ name: "Höhenverstellbar min in cm", key: "hoehenverstellbar_min", type: "number_decimal" },
	{ name: "Besonderheit", key: "besonderheit", type: "single_line_text_field" },
	{ name: "Ausziehbar", key: "ausziehbar", type: "single_line_text_field" },
	{ name: "Ausziehbar max in cm", key: "ausziehbar_max", type: "number_decimal" },
	{ name: "Füße", key: "legs", type: "single_line_text_field" },
	{ name: "Schubfach", key: "schubfach", type: "single_line_text_field" },
	{ name: "Schubfach Anzahl", key: "schubfach_anzahl", type: "single_line_text_field" },
	{ name: "Material Gestell", key: "material_gestell", type: "single_line_text_field" },
	{ name: "Material Sitzflaeche", key: "material_sitzflaeche", type: "single_line_text_field" },
	{ name: "Material Rueckenlehne", key: "material_rueckenlehne", type: "single_line_text_field" },
	{ name: "Material Armlehne", key: "material_armlehne", type: "single_line_text_field" },
	{ name: "Materialeigenschaften", key: "materialeigenschaften", type: "single_line_text_field" },
	{ name: "Farbe Gestell", key: "farbe_gestell", type: "single_line_text_field" },
	{ name: "Farbe Sitzflaeche", key: "farbe_sitzflaeche", type: "single_line_text_field" },
	{ name: "Hoehe Sitzflaeche", key: "hoehe_sitzflaeche", type: "number_decimal" },
	{ name: "Hoehe Sitzmoebel", key: "hoehe_sitzmoebel", type: "number_decimal" },
	{ name: "Breite Sitzmoebel", key: "breite_sitzmoebel", type: "number_decimal" },
	{ name: "Tiefe Sitzmoebel", key: "tiefe_sitzmoebel", type: "number_decimal" },
	{ name: "Durchmesser Sitzflaeche", key: "durchmesser_sitzflaeche", type: "number_decimal" },
	{ name: "Bauform Sitzmoebel", key: "bauform_sitzmoebel", type: "single_line_text_field" },
	{ name: "Oberflaeche", key: "oberflaeche", type: "single_line_text_field" },
	{ name: "Ruecklehnenverstellbarkeit", key: "ruecklehnenverstellbarkeit", type: "single_line_text_field" },
	{ name: "Hoehenverstellbar Sitz", key: "hoehenverstellbar_sitz", type: "single_line_text_field" },
	{ name: "Hoehenverstellbar max", key: "hoehenverstellbar_max", type: "number_decimal" },
	{ name: "Hoehenverstellbar min", key: "hoehenverstellbar_min", type: "number_decimal" },
	{ name: "Besonderheit Sitzmoebel", key: "besonderheit_sitzmoebel", type: "single_line_text_field" },
	{ name: "Bodengleiter", key: "bodengleiter", type: "single_line_text_field" },
	{ name: "Stappelbar", key: "stappelbar", type: "single_line_text_field" },
	{ name: "Aufstehhilfe", key: "aufstehhilfe", type: "single_line_text_field" },
	{ name: "Belastbar", key: "belastbar", type: "number_decimal" },
	{ name: "Rollen", key: "rollen", type: "single_line_text_field" },
	{ name: "Anzahl Sitze", key: "anzahl_sitze", type: "number_integer" },
	{ name: "Stoffzusammensetzung", key: "stoffzusammensetzung", type: "single_line_text_field" },
	{ name: "Material Bett", key: "material_bett", type: "single_line_text_field" },
	{ name: "Material Matratze", key: "material_matratze", type: "single_line_text_field" },
	{ name: "Stoffzusammensetzung", key: "stoffzusammensetzung", type: "single_line_text_field" },
	{ name: "Farbe Matratze", key: "farbe_matratze", type: "single_line_text_field" },
	{ name: "Farbe Bett", key: "farbe_bett", type: "single_line_text_field" },
	{ name: "Farbe 2 Bett", key: "farbe_2_bett", type: "single_line_text_field" },
	{ name: "Hoehe Bett Kopfteil", key: "hoehe_bett_kopfteil", type: "number_decimal" },
	{ name: "Hoehe Bett Fussteil", key: "hoehe_bett_fussteil", type: "number_decimal" },
	{ name: "Breite Bett", key: "breite_bett", type: "number_decimal" },
	{ name: "Tiefe Bett", key: "tiefe_bett", type: "number_decimal" },
	{ name: "Bodenfreiheit Bett", key: "bodenfreiheit_bett", type: "number_decimal" },
	{ name: "Einstiegshoehe", key: "einstiegshoehe", type: "number_decimal" },
	{ name: "Einlegetiefe Lattenrost", key: "einlegetiefe_lattenrost", type: "number_decimal" },
	{ name: "Bauform Bett", key: "bauform_bett", type: "single_line_text_field" },
	{ name: "Oberflaeche", key: "oberflaeche", type: "single_line_text_field" },
	{ name: "Besonderheit", key: "besonderheit", type: "multi_line_text_field" },
	{ name: "Lattenrost", key: "lattenrost", type: "single_line_text_field" },
	{ name: "Matratze", key: "matratze", type: "single_line_text_field" },
	{ name: "Ausziehbares", key: "ausziehbares", type: "single_line_text_field" },
	{ name: "Material Schrank", key: "material_schrank", type: "single_line_text_field" },
	{ name: "Farbe Schrank", key: "farbe_schrank", type: "single_line_text_field" },
	{ name: "Farbe 2 Schrank", key: "farbe_2_schrank", type: "single_line_text_field" },
	{ name: "Hoehe Schrank", key: "hoehe_schrank", type: "number_decimal" },
	{ name: "Breite Schrank", key: "breite_schrank", type: "number_decimal" },
	{ name: "Tiefe Schrank", key: "tiefe_schrank", type: "number_decimal" },
	{ name: "Bauform Schrank", key: "bauform_schrank", type: "single_line_text_field" },
	{ name: "Oberflaeche", key: "oberflaeche", type: "single_line_text_field" },
	{ name: "Besonderheit Schrank", key: "besonderheit_schrank", type: "multi_line_text_field" },
	{ name: "Tueren", key: "tueren", type: "number_integer" },
	{ name: "Ausziehbares", key: "ausziehbares", type: "number_integer" },
	{ name: "Faecher", key: "faecher", type: "number_integer" },
	{ name: "Rollen", key: "rollen", type: "single_line_text_field" },
	{ name: "Material Basis", key: "material_basis", type: "single Divinity_line_text_field" },
	{ name: "Material Schirm", key: "material_schirm", type: "single_line_text_field" },
	{ name: "Farbe Basis", key: "farbe_basis", type: "single_line_text_field" },
	{ name: "Farbe Lampenschirm", key: "farbe_lampenschirm", type: "single_line_text_field" },
	{ name: "Tiefe Lampe", key: "tiefe_lampe", type: "number_decimal" },
	{ name: "Hoehe Lampe", key: "hoehe_lampe", type: "number_decimal" },
	{ name: "Breite Lampe", key: "breite_lampe", type: "number_decimal" },
	{ name: "Durchmesser Lampe Basis", key: "durchmesser_lampe_basis", type: "number_decimal" },
	{ name: "Durchmesser Lampenschirm oben", key: "durchmesser_lampenschirm_oben", type: "number_decimal" },
	{ name: "Durchmesser Lampenschirm unten", key: "durchmesser_lampenschirm_unten", type: "number_decimal" },
	{ name: "Hoehe Lampenschirm", key: "hoehe_lampenschirm", type: "number_decimal" },
	{ name: "Einaumasse", key: "einaumasse", type: "number_decimal" },
	{ name: "Einbautiefe", key: "einbautiefe", type: "number_decimal" },
	{ name: "Bauform Lampe", key: "bauform_lampe", type: "single_line_text_field" },
	{ name: "Oberflaeche", key: "oberflaeche", type: "single_line_text_field" },
	{ name: "Hoehenverstellbar", key: "hoehenverstellbar", type: "single_line_text_field" },
	{ name: "Hoehenverstellbar max", key: "hoehenverstellbar_max", type: "number_decimal" },
	{ name: "Hoehenverstellbar min", key: "hoehenverstellbar_min", type: "number_decimal" },
	{ name: "Besonderheit Leuchten", key: "besonderheit_leuchten", type: "single_line_text_field" },
	{ name: "Dimmbarkeit", key: "dimmbarkeit", type: "single_line_text_field" },
	{ name: "Dimmer Art", key: "dimmer_art", type: "single_line_text_field" },
	{ name: "Lichtquelle", key: "lichtquelle", type: "single_line_text_field" },
	{ name: "Lichtquelle Art", key: "lichtquelle_art", type: "single_line_text_field" },
	{ name: "Lumen", key: "lumen", type: "number_integer" },
	{ name: "Leistung", key: "leistung", type: "number_decimal" },
	{ name: "Anzahl der Lichtquellen", key: "anzahl_lichtquellen", type: "number_integer" },
	{ name: "EEC", key: "eec", type: "multi_line_text_field" },
	{ name: "EEC-Specktrum", key: "eec_specktrum", type: "multi_line_text_field" },
	{ name: "Fassung", key: "fassung", type: "single_line_text_field" },
	{ name: "Lichtfarbe", key: "lichtfarbe", type: "single_line_text_field" },
	{ name: "Lichfarbwert", key: "lichfarbwert", type: "number_integer" },
	{ name: "Schutzart", key: "schutzart", type: "single_line_text_field" },
	{ name: "Schutzklasse", key: "schutzklasse", type: "single_line_text_field" },
	{ name: "Lebensdauer", key: "lebensdauer", type: "number_integer" },
	{ name: "Anschluss", key: "anschluss", type: "single_line_text_field" },
	{ name: "Schalter", key: "schalter", type: "single_line_text_field" },
	{ name: "Schalter Art", key: "schalter_art", type: "single_line_text_field" },
	{ name: "Smarthome", key: "smarthome", type: "single_line_text_field" },
	{ name: "Smarthome Art", key: "smarthome_art", type: "single_line_text_field" },
	{ name: "Befahrbarkeit", key: "befahrbarkeit", type: "single_line_text_field" },
	{ name: "Belastung", key: "belastung", type: "number_decimal" },
	{ name: "Material Stoff", key: "material_stoff", type: "single_line_text_field" },
	{ name: "Farbe Stoff", key: "farbe_stoff", type: "single_line_text_field" },
	{ name: "Breite Stoff", key: "breite_stoff", type: "number_decimal" },
	{ name: "Laenge Stoff", key: "laenge_stoff", type: "number_decimal" },
	{ name: "Dicke Stoff", key: "dicke_stoff", type: "number_decimal" },
	{ name: "Durchmesser Stoff", key: "durchmesser_stoff", type: "number_decimal" },
	{ name: "Bauform Stoff", key: "bauform_stoff", type: "single_line_text_field" },
	{ name: "Oberflaeche Stoff", key: "oberflaeche_stoff", type: "single_line_text_field" },
	{ name: "Besonderheit Stoff", key: "besonderheit_stoff", type: "single_line_text_field" },
	{ name: "Belastbar", key: "belastbar", type: "number_decimal" },
	{ name: "Lieferumfang", key: "lieferumfang", type: "multi_line_text_field" },
	{ name: "Fuellung", key: "fuellung", type: "multi_line_text_field" },
	{ name: "Stoffzusammensetzung", key: "stoffzusammensetzung", type: "multi_line_text_field" },
];

async function createMetafieldDefinition(client, metafield, categoryId = null) {
	const query = `
      mutation metafieldDefinitionCreate($definition: MetafieldDefinitionInput!) {
        metafieldDefinitionCreate(definition: $definition) {
          createdDefinition {
            id
            name
            namespace
            key
            type {
              name
            }
            constraints {
              key
              values(first: 10) {
                nodes {
                  value
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

	const variables = {
		definition: {
			name: metafield.name,
			namespace: "custom",
			key: metafield.key,
			type: metafield.type,
			ownerType: "PRODUCTVARIANT",
			access: { storefront: "PUBLIC_READ" },
			...(categoryId && {
				constraints: {
					key: "category",
					values: Array.isArray(categoryId) ? categoryId : [categoryId],
				},
			}),
		},
	};

	// API-Aufruf mit der neuen Client-Bibliothek
	const response = await client.request(query, { variables });
	return (
		response.data?.metafieldDefinitionCreate || { userErrors: response.errors || [{ message: "Unknown error" }] }
	);
}

// Haupt-GET-Handler
export async function GET(request) {
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

		// Ergebnisse speichern
		const results = {
			general: [],
			categories: {},
		};

		// 1. Allgemeine Metafelder erstellen (ohne Kategorie)
		for (const metafield of generalMetafieldDefinitions) {
			const result = await createMetafieldDefinition(client, metafield);
			results.general.push({
				metafield: metafield.name,
				success: result.userErrors.length === 0,
				errors: result.userErrors,
			});
			await new Promise((resolve) => setTimeout(resolve, 100)); // Rate-Limit-Schutz
		}

		// 2. Kategorie-spezifische Metafelder erstellen
		// for (const [categoryName, categoryId] of Object.entries(categoryMap)) {
		// 	const metafields = metafieldDefinitions[categoryName] || [];
		// 	results.categories[categoryName] = [];

		// 	for (const metafield of metafields) {
		// 		const result = await createMetafieldDefinition(client, metafield, categoryId);
		// 		results.categories[categoryName].push({
		// 			metafield: metafield.name,
		// 			success: result.userErrors.length === 0,
		// 			errors: result.userErrors,
		// 		});
		// 		await new Promise((resolve) => setTimeout(resolve, 100)); // Rate-Limit-Schutz
		// 	}
		// }

		return NextResponse.json(
			{
				message: "Metafield definitions created",
				results,
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
