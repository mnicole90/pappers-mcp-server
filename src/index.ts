#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE_URL = 'https://api.pappers.fr/v2';

function getApiToken(): string {
  const token = process.env['PAPPERS_API_TOKEN'];
  if (!token) throw new Error('PAPPERS_API_TOKEN environment variable is required');
  return token;
}

async function pappers(endpoint: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(`${BASE_URL}${endpoint}`);
  url.searchParams.set('api_token', getApiToken());
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  const resp = await fetch(url.toString());
  if (!resp.ok) throw new Error(`Pappers API error ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

// ── Server ─────────────────────────────────────────────────

const server = new McpServer({
  name: 'pappers-mcp-server',
  version: '1.0.0',
});

// ── search-company ────────────────────────────────────────

server.tool(
  'search-company',
  'Search for French companies by name, NAF code, department, region or workforce range.',
  {
    q: z.string().describe('Search query (company name, SIREN, etc.)'),
    code_naf: z.string().default('').describe('NAF code filter (e.g. "6201Z")'),
    departement: z.string().default('').describe('Department number filter (e.g. "75")'),
    region: z.string().default('').describe('Region filter (e.g. "Ile-de-France")'),
    tranche_effectif: z.string().default('').describe('Workforce range filter'),
    page: z.string().default('1').describe('Page number (default 1)'),
    par_page: z.string().default('10').describe('Results per page (default 10, max 100)'),
  },
  async (params) => {
    const data = (await pappers('/recherche', {
      q: params.q,
      code_naf: params.code_naf,
      departement: params.departement,
      region: params.region,
      tranche_effectif: params.tranche_effectif,
      page: params.page,
      par_page: params.par_page,
      champs_supplementaires: 'sites_internet,telephone,email',
    })) as {
      resultats: Array<{
        siren: string;
        nom_entreprise: string;
        siege?: {
          siret?: string;
          adresse_ligne_1?: string;
          code_postal?: string;
          ville?: string;
        };
        code_naf?: string;
        libelle_code_naf?: string;
        tranche_effectif?: string;
        dirigeants?: Array<{
          nom?: string;
          prenom?: string;
          qualite?: string;
        }>;
        sites_internet?: Array<{ url?: string }>;
        telephone?: string;
        email?: string;
      }>;
      total: number;
      page: number;
    };

    if (!data.resultats?.length) {
      return textResult('Aucun resultat trouve.');
    }

    const lines = [`**${data.total} resultats** (page ${data.page})\n`];

    for (const e of data.resultats) {
      const parts = [`### ${e.nom_entreprise}`, `SIREN: ${e.siren}`];

      if (e.siege?.siret) parts.push(`SIRET siege: ${e.siege.siret}`);
      if (e.siege) {
        const addr = [e.siege.adresse_ligne_1, e.siege.code_postal, e.siege.ville]
          .filter(Boolean)
          .join(' ');
        if (addr) parts.push(`Adresse: ${addr}`);
      }
      if (e.code_naf) parts.push(`NAF: ${e.code_naf} - ${e.libelle_code_naf || ''}`);
      if (e.tranche_effectif) parts.push(`Effectif: ${e.tranche_effectif}`);

      if (e.dirigeants?.length) {
        const dirs = e.dirigeants
          .map((d) => `${d.prenom || ''} ${d.nom || ''} (${d.qualite || ''})`.trim())
          .join(', ');
        parts.push(`Dirigeants: ${dirs}`);
      }

      if (e.sites_internet?.length) {
        parts.push(`Site web: ${e.sites_internet.map((s) => s.url).join(', ')}`);
      }
      if (e.telephone) parts.push(`Telephone: ${e.telephone}`);
      if (e.email) parts.push(`Email: ${e.email}`);

      lines.push(parts.join('\n'));
    }

    return textResult(lines.join('\n\n'));
  },
);

// ── get-company ───────────────────────────────────────────

server.tool(
  'get-company',
  'Get detailed information about a French company by SIREN or SIRET number.',
  {
    siren: z.string().default('').describe('SIREN number (9 digits)'),
    siret: z.string().default('').describe('SIRET number (14 digits). Use either siren or siret.'),
  },
  async (params) => {
    if (!params.siren && !params.siret) {
      return textResult('Erreur: vous devez fournir un SIREN ou un SIRET.');
    }

    const queryParams: Record<string, string> = {
      champs_supplementaires: 'sites_internet,telephone,email,lien_linkedin',
    };
    if (params.siret) {
      queryParams.siret = params.siret;
    } else {
      queryParams.siren = params.siren;
    }

    const data = (await pappers('/entreprise', queryParams)) as {
      siren: string;
      nom_entreprise: string;
      siege?: {
        siret?: string;
        adresse_ligne_1?: string;
        adresse_ligne_2?: string;
        code_postal?: string;
        ville?: string;
        pays?: string;
      };
      forme_juridique?: string;
      date_creation?: string;
      date_creation_formate?: string;
      tranche_effectif?: string;
      effectif?: string;
      effectifs_finances?: number;
      capital?: number;
      capital_formate?: string;
      representants?: Array<{
        nom?: string;
        prenom?: string;
        nom_complet?: string;
        qualite?: string;
        date_de_naissance_formate?: string;
        personne_morale?: boolean;
        denomination?: string;
      }>;
      sites_internet?: Array<{ url?: string }>;
      telephone?: string;
      email?: string;
      lien_linkedin?: string;
      numero_tva_intracommunautaire?: string;
      code_naf?: string;
      libelle_code_naf?: string;
      objet_social?: string;
      statut_rcs?: string;
      greffe?: string;
      date_immatriculation_rcs?: string;
      derniere_mise_a_jour_rcs?: string;
    };

    const lines = [`# ${data.nom_entreprise}`];
    lines.push(`**SIREN:** ${data.siren}`);
    if (data.siege?.siret) lines.push(`**SIRET siege:** ${data.siege.siret}`);

    if (data.forme_juridique) lines.push(`**Forme juridique:** ${data.forme_juridique}`);
    if (data.date_creation_formate || data.date_creation) {
      lines.push(`**Date de creation:** ${data.date_creation_formate || data.date_creation}`);
    }
    if (data.code_naf) {
      lines.push(`**Code NAF:** ${data.code_naf} - ${data.libelle_code_naf || ''}`);
    }
    if (data.objet_social) lines.push(`**Objet social:** ${data.objet_social}`);

    // Adresse
    if (data.siege) {
      const addr = [
        data.siege.adresse_ligne_1,
        data.siege.adresse_ligne_2,
        data.siege.code_postal,
        data.siege.ville,
        data.siege.pays,
      ]
        .filter(Boolean)
        .join(' ');
      if (addr) lines.push(`**Adresse:** ${addr}`);
    }

    // Effectif & Capital
    if (data.tranche_effectif || data.effectif) {
      lines.push(`**Effectif:** ${data.effectif || data.tranche_effectif}`);
    }
    if (data.capital_formate || data.capital) {
      lines.push(`**Capital social:** ${data.capital_formate || `${data.capital} EUR`}`);
    }

    // Représentants
    if (data.representants?.length) {
      lines.push('\n**Dirigeants:**');
      for (const d of data.representants) {
        if (d.personne_morale && d.denomination) {
          lines.push(`- ${d.denomination} (${d.qualite || 'N/A'})`);
        } else {
          const name = d.nom_complet || `${d.prenom || ''} ${d.nom || ''}`.trim();
          lines.push(`- ${name} (${d.qualite || 'N/A'})`);
        }
      }
    }

    // Contact & web
    if (data.sites_internet?.length) {
      lines.push(`\n**Site(s) web:** ${data.sites_internet.map((s) => s.url).join(', ')}`);
    }
    if (data.telephone) lines.push(`**Téléphone:** ${data.telephone}`);
    if (data.email) lines.push(`**Email:** ${data.email}`);
    if (data.lien_linkedin) lines.push(`**LinkedIn:** ${data.lien_linkedin}`);
    if (data.numero_tva_intracommunautaire) {
      lines.push(`**N° TVA:** ${data.numero_tva_intracommunautaire}`);
    }
    if (data.greffe) lines.push(`**Greffe:** ${data.greffe}`);
    if (data.statut_rcs) lines.push(`**Statut RCS:** ${data.statut_rcs}`);

    return textResult(lines.join('\n'));
  },
);

// ── get-dirigeants ────────────────────────────────────────

server.tool(
  'get-dirigeants',
  "Get the list of directors/officers of a French company by SIREN number.",
  {
    siren: z.string().describe('SIREN number (9 digits)'),
  },
  async (params) => {
    const data = (await pappers('/entreprise', {
      siren: params.siren,
      champs_supplementaires: 'lien_linkedin',
    })) as {
      nom_entreprise: string;
      siren: string;
      representants?: Array<{
        nom?: string;
        prenom?: string;
        nom_complet?: string;
        qualite?: string;
        date_de_naissance_formate?: string;
        nationalite?: string;
        personne_morale?: boolean;
        denomination?: string;
        siren?: string;
        adresse_ligne_1?: string;
        code_postal?: string;
        ville?: string;
      }>;
      lien_linkedin?: string;
    };

    if (!data.representants?.length) {
      return textResult(`Aucun dirigeant trouvé pour ${data.nom_entreprise} (${data.siren}).`);
    }

    const lines = [`# Dirigeants de ${data.nom_entreprise} (${data.siren})\n`];

    for (const d of data.representants) {
      if (d.personne_morale && d.denomination) {
        const parts = [`### ${d.denomination}`];
        if (d.siren) parts.push(`SIREN: ${d.siren}`);
        if (d.qualite) parts.push(`Fonction: ${d.qualite}`);
        lines.push(parts.join('\n'));
      } else {
        const name = d.nom_complet || `${d.prenom || ''} ${d.nom || ''}`.trim();
        const parts = [`### ${name}`];
        if (d.qualite) parts.push(`Fonction: ${d.qualite}`);
        if (d.date_de_naissance_formate) parts.push(`Date de naissance: ${d.date_de_naissance_formate}`);
        if (d.nationalite) parts.push(`Nationalité: ${d.nationalite}`);
        lines.push(parts.join('\n'));
      }
    }

    if (data.lien_linkedin) lines.push(`\n**LinkedIn entreprise:** ${data.lien_linkedin}`);

    return textResult(lines.join('\n\n'));
  },
);

// ── get-finances ──────────────────────────────────────────

server.tool(
  'get-finances',
  'Get financial data (revenue, profit, workforce) of a French company by SIREN number.',
  {
    siren: z.string().describe('SIREN number (9 digits)'),
  },
  async (params) => {
    const data = (await pappers('/entreprise', {
      siren: params.siren,
      champs_supplementaires: 'finances',
    })) as {
      nom_entreprise: string;
      siren: string;
      finances?: Array<{
        annee?: number;
        date_cloture?: string;
        date_cloture_formate?: string;
        duree_exercice?: number;
        chiffre_affaires?: number;
        resultat?: number;
        effectif?: number;
        marge_brute?: number;
        excedent_brut_exploitation?: number;
        resultat_exploitation?: number;
        resultat_net?: number;
        capitaux_propres?: number;
        total_bilan?: number;
      }>;
    };

    if (!data.finances?.length) {
      return textResult(
        `Aucune donnee financiere trouvee pour ${data.nom_entreprise} (${data.siren}).`,
      );
    }

    const lines = [`# Donnees financieres de ${data.nom_entreprise} (${data.siren})\n`];

    for (const f of data.finances) {
      const year = f.annee || f.date_cloture_formate || f.date_cloture || 'N/A';
      const parts = [`### Exercice ${year}`];

      if (f.date_cloture_formate) parts.push(`Cloture: ${f.date_cloture_formate}`);
      if (f.duree_exercice) parts.push(`Duree: ${f.duree_exercice} mois`);

      if (f.chiffre_affaires != null) {
        parts.push(`Chiffre d'affaires: ${formatCurrency(f.chiffre_affaires)}`);
      }
      if (f.resultat != null) parts.push(`Resultat: ${formatCurrency(f.resultat)}`);
      if (f.resultat_net != null) parts.push(`Resultat net: ${formatCurrency(f.resultat_net)}`);
      if (f.resultat_exploitation != null) {
        parts.push(`Resultat d'exploitation: ${formatCurrency(f.resultat_exploitation)}`);
      }
      if (f.excedent_brut_exploitation != null) {
        parts.push(`EBE: ${formatCurrency(f.excedent_brut_exploitation)}`);
      }
      if (f.marge_brute != null) parts.push(`Marge brute: ${formatCurrency(f.marge_brute)}`);
      if (f.effectif != null) parts.push(`Effectif: ${f.effectif}`);
      if (f.capitaux_propres != null) {
        parts.push(`Capitaux propres: ${formatCurrency(f.capitaux_propres)}`);
      }
      if (f.total_bilan != null) parts.push(`Total bilan: ${formatCurrency(f.total_bilan)}`);

      lines.push(parts.join('\n'));
    }

    return textResult(lines.join('\n\n'));
  },
);

// ── search-dirigeant ──────────────────────────────────────

server.tool(
  'search-dirigeant',
  'Search for company directors/officers by name.',
  {
    q: z.string().describe('Director name to search for'),
    page: z.string().default('1').describe('Page number (default 1)'),
    par_page: z.string().default('10').describe('Results per page (default 10)'),
  },
  async (params) => {
    const data = (await pappers('/recherche-dirigeants', {
      q: params.q,
      page: params.page,
      par_page: params.par_page,
    })) as {
      resultats: Array<{
        nom?: string;
        prenom?: string;
        date_de_naissance?: string;
        date_de_naissance_formate?: string;
        nationalite?: string;
        entreprises?: Array<{
          siren?: string;
          nom_entreprise?: string;
          qualite?: string;
        }>;
      }>;
      total: number;
      page: number;
    };

    if (!data.resultats?.length) {
      return textResult('Aucun dirigeant trouve.');
    }

    const lines = [`**${data.total} resultats** (page ${data.page})\n`];

    for (const d of data.resultats) {
      const name = `${d.prenom || ''} ${d.nom || ''}`.trim();
      const parts = [`### ${name}`];

      if (d.date_de_naissance_formate || d.date_de_naissance) {
        parts.push(
          `Date de naissance: ${d.date_de_naissance_formate || d.date_de_naissance}`,
        );
      }
      if (d.nationalite) parts.push(`Nationalite: ${d.nationalite}`);

      if (d.entreprises?.length) {
        parts.push('Entreprises:');
        for (const e of d.entreprises) {
          parts.push(`- ${e.nom_entreprise || 'N/A'} (SIREN: ${e.siren || 'N/A'}) — ${e.qualite || 'N/A'}`);
        }
      }

      lines.push(parts.join('\n'));
    }

    return textResult(lines.join('\n\n'));
  },
);

// ── Helpers ───────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
}

// ── Start ─────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
