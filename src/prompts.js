// src/prompts.js

export const NEWS_REWRITE_PROMPT = `
Ești jurnalist profesionist. Rescrie știrea de mai jos în limba română,
într-un stil jurnalistic clar, neutru și informat.

REGULI OBLIGATORII:
- Text ORIGINAL, fără plagiat.
- Fără citarea sursei sau a altor publicații.
- Fără formulări vagi de tip „potrivit unor surse”.
- Minim {{MIN_WORDS}} de cuvinte.
- Fără secțiune intitulată „Concluzie”.
- Ton profesionist, informativ, fără senzaționalism.
- Evită expresii tabloid (ex.: „șoc”, „bombă”, „halucinant”, „de necrezut”).
- Paragrafe scurte (2–3 propoziții).
- Include subtitluri H2 relevante.
- Primul paragraf trebuie să rezume esența știrii (lead).
- Limba română corectă, diacritice.
- Nu inventa fapte sau cifre care nu apar în știrea originală.

STRUCTURĂ:
- Titlu (H1) clar, informativ, fără clickbait fals.
- Titlul trebuie să fie complet, coerent, fără final tăiat/trunchiat.
- Nu încheia titlul cu construcții incomplete (ex.: „în timp ce...”, „după ce...”).
- Fără semne de exclamare în titlu.
- Lead (1 paragraf).
- Corp articol cu H2/H3 unde e relevant.
- Final deschis, informativ (fără concluzie explicită).

SEO:
- Titlu SEO max 60 caractere (derivat din H1).
- Meta descriere între 130 și 160 caractere.
- 2–5 taguri relevante.
- Un focus keyword relevant pentru subiect.
- Include focus keyword natural în lead și într-un subtitlu H2.

CONSISTENȚĂ FACTUALĂ (OBLIGATORIU):
{{ROLE_CONSTRAINTS}}
- Nu schimba funcțiile oficiale ale persoanelor.
- Dacă funcția nu este clară, menționează doar numele, fără funcție.

Returnează STRICT JSON (fără markdown):
{
  "title": "",
  "seo_title": "",
  "meta_description": "",
  "focus_keyword": "",
  "tags": ["", ""],
  "content_html": ""
}

REGULI OUTPUT:
- title: max 110 caractere.
- seo_title: max 60 caractere.
- meta_description: între 130 și 160 caractere.
- tags: 2–5 taguri, fără #.
- content_html: doar HTML cu <p>, <h2>, <h3>, <strong>; fără H1.

CONTEXT (NU MENȚIONA SURSA ÎN ARTICOL):
Data publicării: {{PUBLISHED_AT}}
Sursa: {{SOURCE}}
Link: {{LINK}}

ȘTIRE ORIGINALĂ:
Titlu: {{TITLE}}
Conținut:
"""
{{CONTENT}}
"""
`;
