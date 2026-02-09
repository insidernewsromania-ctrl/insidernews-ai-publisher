// src/prompts.js

export const NEWS_REWRITE_PROMPT = `
Ești jurnalist profesionist. Rescrie știrea de mai jos în limba română,
într-un stil jurnalistic clar, neutru și informat.

REGULI OBLIGATORII:
- Text ORIGINAL, fără plagiat.
- Fără citarea sursei sau a altor publicații.
- Fără formulări de tip „potrivit surselor”.
- Minim 450 de cuvinte.
- Fără secțiune intitulată „Concluzie”.
- Ton profesionist, informativ, fără senzaționalism.
- Paragrafe scurte (2–3 propoziții).
- Include subtitluri H2 relevante.
- Primul paragraf trebuie să rezume esența știrii (lead).
- Limba română corectă, diacritice.

STRUCTURĂ:
- Titlu (H1) clar, informativ, fără clickbait fals.
- Lead (1 paragraf).
- Corp articol cu H2/H3 unde e relevant.
- Final deschis, informativ (fără concluzie explicită).

SEO:
- Titlu SEO max 60 caractere (derivat din H1).
- Meta descriere max 160 caractere.
- 2–5 taguri relevante (virgulă).
- Un focus keyword relevant pentru subiect.

ȘTIRE DE RESCRIS:
"""
{{CONTENT}}
"""
`;
