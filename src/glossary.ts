// Romanian → English clinical glossary applied before machine translation.
// General-purpose translation models mangle exam vocabulary and
// abbreviations ("splina nepalpabilă" → "spleen unmistakable"); replacing
// known terms with their English equivalents first means the model only has
// to translate the connecting words.

// Make a Romanian pattern tolerant of missing diacritics and cedilla forms.
function loose(pattern: string): string {
  const classes: Record<string, string> = {
    a: "[aăâ]", ă: "[aăâ]", â: "[aăâ]",
    i: "[iî]", î: "[iî]",
    s: "[sșş]", ș: "[sșş]", ş: "[sșş]",
    t: "[tțţ]", ț: "[tțţ]", ţ: "[tțţ]",
  };
  // Single pass, lower-case letters only: upper-case abbreviations stay exact.
  return pattern.replace(/[aăâiîsșştțţ]/g, (ch) => classes[ch]);
}

const W = String.raw`(?<![\p{L}\p{N}])`;
const E = String.raw`(?![\p{L}\p{N}])`;

// Longer phrases first. Patterns may use (?:…) for inflected endings.
const BUILT_IN: [string, string][] = [
  // Examination: general
  ["stare(?:a)? generală (?:relativ )?bună", "good general condition"],
  ["stare(?:a)? generală alterată", "impaired general condition"],
  ["stare(?:a)? (?:de )?nutriți(?:e|ie) subponderală", "underweight nutritional status"],
  ["stare(?:a)? (?:de )?nutriți(?:e|ie) (?:normoponderală|bună)", "normal nutritional status"],
  ["stare(?:a)? (?:de )?nutriți(?:e|ie) supraponderală", "overweight nutritional status"],
  ["subponderal(?:ă)?", "underweight"],
  ["cașectic(?:ă)?", "cachectic"],
  ["stare(?:a)? de conștiență păstrată", "conscious"],
  ["conștient(?:ă)?,? cooperant(?:ă)?", "conscious and cooperative"],
  ["facies expresiv", "normal facial expression"],
  ["tegumente(?:le)? hiperpigmentate", "hyperpigmented skin"],
  ["tegumente(?:le)? icterice", "jaundiced skin"],
  ["tegumente(?:le)? (?:normal )?colorate", "normally coloured skin"],
  ["(?:ușor|usor) deshidratat(?:ă|e)?", "mildly dehydrated"],
  ["fanere(?:le)? corespunzătoare vârstei și sexului", "hair and nails appropriate for age and sex"],
  ["fanere", "hair and nails"],
  ["țesut(?:ul)? conjun?ctiv-adipos slab reprezentat", "reduced subcutaneous fat"],
  ["țesut(?:ul)? conjun?ctiv-adipos (?:normal reprezentat|bine reprezentat)", "normal subcutaneous fat"],
  ["nu se palpează adenopatii(?: superficiale sau profunde)?", "no palpable lymphadenopathy"],
  ["sistem(?:ul)? ganglionar", "lymph nodes:"],
  ["normoton,? normokinetic", "normal muscle tone and movement"],
  ["aparent integru", "apparently intact"],
  ["nedureros la mobilizare activă (?:sau|și) pasivă", "painless on active and passive movement"],
  ["coloana vertebrală nedureroasă la percuție", "spine non-tender to percussion"],
  ["torace normal conformat", "normally shaped chest"],
  ["participă simetric la mișcările respiratorii", "symmetrical chest expansion"],
  ["puls palpabil (?:în|la) distalitate", "distal pulses palpable"],
  ["stetacustic", "on auscultation"],
  ["(?:Zg|zgomote(?:le)?) cardiace ritmice", "regular heart sounds"],
  ["(?:Zg|zgomote(?:le)?) cardiace", "heart sounds"],
  ["aparat(?:ul)? respirator", "respiratory system:"],
  ["aparat(?:ul)? cardiovascular", "cardiovascular system:"],
  ["aparat(?:ul)? digestiv", "digestive system:"],
  ["sistem(?:ul)? nervos", "nervous system:"],
  ["sistem(?:ul)? muscular", "muscular system:"],
  ["sistem(?:ul)? osteo-articular", "musculoskeletal system:"],
  ["fără edem(?:e)?", "no oedema"],
  ["fără semne de", "no signs of"],
  // Examination: organs
  ["sub rebordul costal drept", "below the right costal margin"],
  ["sub rebordul costal stâng", "below the left costal margin"],
  ["rebord(?:ul)? costal drept", "right costal margin"],
  ["rebord(?:ul)? costal stâng", "left costal margin"],
  ["nepalpabil(?:ă|e|i)?", "non-palpable"],
  ["palpabil(?:ă|e|i)?", "palpable"],
  ["zgomote(?:le)? cardiace ritmice", "regular heart sounds"],
  ["bine bătute", "well heard"],
  ["fără sufluri", "no murmurs"],
  ["fără raluri", "no rales"],
  ["raluri (?:subcrepitante|crepitante)", "crackles"],
  ["raluri ronflante", "rhonchi"],
  ["murmur vezicular", "vesicular breath sounds"],
  ["MV prezent bilateral", "vesicular breath sounds present bilaterally"],
  ["abdomen suplu,? elastic", "soft, supple abdomen"],
  ["abdomen suplu", "soft abdomen"],
  ["nedureros la palpare(?: superficială (?:sau|și) profundă)?", "non-tender on palpation"],
  ["nedureros", "non-tender"],
  ["dureros la palpare", "tender on palpation"],
  ["tranzit intestinal prezent", "bowel movements present"],
  ["man(?:e)?v(?:e)?ra Giordano negativă(?: bilateral)?", "no costovertebral angle tenderness (negative Giordano sign)"],
  ["man(?:e)?v(?:e)?ra Giordano pozitivă", "positive costovertebral angle tenderness (Giordano sign)"],
  ["micțiuni fiziologice(?: spontane)?", "normal spontaneous urination"],
  ["diureză fiziologică", "normal diuresis"],
  ["iritați(?:e|a) meninge(?:ană|ală|ala)", "meningeal irritation"],
  ["semne de focar", "focal neurological signs"],
  ["orientat temporo-?spațial", "oriented to time and place"],
  ["stabil(?:ă)? hemodinamic și respirator", "hemodynamically and respiratorily stable"],
  ["stabil(?:ă)? HD și respirator", "hemodynamically and respiratorily stable"],
  ["în aerul ambiental", "on room air"],
  ["tegumente(?:le)? palide", "pale skin"],
  ["mucoase(?:le)? palide", "pale mucous membranes"],
  ["deshidratat(?:ă|e)?", "dehydrated"],
  ["afebril(?:ă)?", "afebrile"],
  ["edeme gambiere", "leg oedema"],
  ["fără edeme", "no oedema"],
  ["adenopatii", "lymphadenopathy"],
  ["ficat(?:ul)?", "liver"],
  ["splin(?:a|ă)", "spleen"],
  // Symptoms and signs
  ["scădere ponderală(?: importantă| involuntară)?", "weight loss"],
  ["pierdere în greutate", "weight loss"],
  ["creștere ponderală", "weight gain"],
  ["inapetență", "loss of appetite"],
  ["astenie(?: fizică)?", "asthenia"],
  ["fatigabilitate", "fatigue"],
  ["oboseală", "fatigue"],
  ["adinamie", "weakness"],
  ["febră", "fever"],
  ["subfebrilitate", "low-grade fever"],
  ["subfebril(?:ă)?", "low-grade fever"],
  ["frisoane", "chills"],
  ["transpirații nocturne", "night sweats"],
  ["transpirații(?: profuze)?", "sweating"],
  ["sete excesivă", "excessive thirst"],
  ["polidipsie", "polydipsia"],
  ["poliurie", "polyuria"],
  ["nicturie", "nocturia"],
  ["polachiurie", "urinary frequency"],
  ["disurie", "dysuria"],
  ["oligurie", "oliguria"],
  ["anurie", "anuria"],
  ["retenție urinară", "urinary retention"],
  ["incontinență urinară", "urinary incontinence"],
  ["hematurie(?: macroscopică| microscopică)?", "haematuria"],
  ["urini hipercrome", "dark urine"],
  ["cefalee", "headache"],
  ["amețeli", "dizziness"],
  ["amețeală", "dizziness"],
  ["vertij", "vertigo"],
  ["lipotimie", "presyncope"],
  ["sincopă", "syncope"],
  ["tulburări de vedere", "visual disturbances"],
  ["vedere încețoșată", "blurred vision"],
  ["diplopie", "diplopia"],
  ["fotofobie", "photophobia"],
  ["acufene", "tinnitus"],
  ["hipoacuzie", "hearing loss"],
  ["epistaxis", "epistaxis"],
  ["rinoree", "rhinorrhoea"],
  ["obstrucție nazală", "nasal obstruction"],
  ["odinofagie", "odynophagia"],
  ["disfagie", "dysphagia"],
  ["disfonie", "dysphonia"],
  ["răgușeală", "hoarseness"],
  ["durere toracică(?: retrosternală)?", "chest pain"],
  ["durere retrosternală", "retrosternal pain"],
  ["constricție toracică", "chest tightness"],
  ["palpitații", "palpitations"],
  ["dispnee(?: de efort| de repaus| paroxistică nocturnă)?", "dyspnoea"],
  ["ortopnee", "orthopnoea"],
  ["polipnee", "tachypnoea"],
  ["tahipnee", "tachypnoea"],
  ["tuse(?: productivă| seacă| iritativă)?", "cough"],
  ["expectorație(?: mucopurulentă| purulentă)?", "sputum production"],
  ["hemoptizie", "haemoptysis"],
  ["wheezing", "wheezing"],
  ["tahicardie", "tachycardia"],
  ["bradicardie", "bradycardia"],
  ["hipotensiune arterială", "hypotension"],
  ["claudicație intermitentă", "intermittent claudication"],
  ["turgescența jugularelor", "jugular venous distension"],
  ["jugulare turgescente", "jugular venous distension"],
  ["durere(?:ri)? abdominal(?:ă|e)", "abdominal pain"],
  ["dureri epigastrice", "epigastric pain"],
  ["durere epigastrică", "epigastric pain"],
  ["epigastralgii", "epigastric pain"],
  ["greață", "nausea"],
  ["grețuri", "nausea"],
  ["vărsături(?: alimentare| bilioase)?", "vomiting"],
  ["pirozis", "heartburn"],
  ["regurgitații", "regurgitation"],
  ["eructații", "belching"],
  ["balonare(?: postprandială)?", "bloating"],
  ["meteorism(?: abdominal)?", "abdominal bloating"],
  ["flatulență", "flatulence"],
  ["diaree", "diarrhoea"],
  ["scaune diareice", "diarrhoea"],
  ["constipație", "constipation"],
  ["tenesme(?: rectale)?", "tenesmus"],
  ["melenă", "melaena"],
  ["hematemeză", "haematemesis"],
  ["rectoragie", "rectal bleeding"],
  ["hematochezie", "haematochezia"],
  ["icter(?: sclero-tegumentar)?", "jaundice"],
  ["subicter(?: scleral)?", "subicterus"],
  ["prurit", "pruritus"],
  ["erupție cutanată", "rash"],
  ["eritem", "erythema"],
  ["peteșii", "petechiae"],
  ["echimoze", "bruising"],
  ["paloare", "pallor"],
  ["cianoză", "cyanosis"],
  ["hepatomegalie", "hepatomegaly"],
  ["splenomegalie", "splenomegaly"],
  ["hepatosplenomegalie", "hepatosplenomegaly"],
  ["ascită", "ascites"],
  ["apărare musculară", "guarding"],
  ["edeme(?: ale)? membrelor inferioare", "lower limb oedema"],
  ["edem(?:e)? (?:gambier|maleolar)(?:e)?", "ankle oedema"],
  ["edeme", "oedema"],
  ["artralgii", "arthralgia"],
  ["mialgii", "myalgia"],
  ["lombalgie", "low back pain"],
  ["dureri lombare", "low back pain"],
  ["redoare(?: matinală)?", "morning stiffness"],
  ["tumefacție articulară", "joint swelling"],
  ["crampe musculare", "muscle cramps"],
  ["parestezii", "paraesthesia"],
  ["amorțeli", "numbness"],
  ["hemipareză", "hemiparesis"],
  ["hemiplegie", "hemiplegia"],
  ["afazie", "aphasia"],
  ["disartrie", "dysarthria"],
  ["tremor", "tremor"],
  ["convulsii", "seizures"],
  ["crize (?:convulsive|epileptice)", "seizures"],
  ["confuzie", "confusion"],
  ["dezorientare(?: temporo-spațială)?", "disorientation"],
  ["somnolență", "drowsiness"],
  ["agitație psihomotorie", "psychomotor agitation"],
  ["insomnie", "insomnia"],
  ["anxietate", "anxiety"],
  ["redoare de ceafă", "neck stiffness"],
  ["adenopatii (?:latero)?cervicale", "cervical lymphadenopathy"],
  ["adenopatii palpabile", "palpable lymphadenopathy"],
  ["leucocitoză", "leukocytosis"],
  ["leucopenie", "leukopenia"],
  ["trombocitopenie", "thrombocytopenia"],
  ["trombocitoză", "thrombocytosis"],
  ["hiperglicemie", "hyperglycaemia"],
  ["hipoglicemie", "hypoglycaemia"],
  ["sindrom(?:ul)? de malabsorbție", "malabsorption"],
  // Conditions
  ["anemie feriprivă", "iron deficiency anaemia"],
  ["insuficiență renală cronică", "chronic kidney failure"],
  ["boală cronică de rinichi", "chronic kidney disease"],
  ["insuficiență cardiacă(?: congestivă)?", "heart failure"],
  ["cardiopatie ischemică(?: cronică)?", "ischaemic heart disease"],
  ["fibrilație atrială", "atrial fibrillation"],
  ["hipertensiune arterială", "arterial hypertension"],
  ["diabet zaharat(?: tip 2| de tip 2)", "type 2 diabetes mellitus"],
  ["diabet zaharat(?: tip 1| de tip 1)", "type 1 diabetes mellitus"],
  ["diabet zaharat", "diabetes mellitus"],
  ["accident vascular cerebral(?: ischemic)?", "stroke"],
  ["infarct miocardic acut", "acute myocardial infarction"],
  ["bronhopneumopatie obstructivă cronică", "chronic obstructive pulmonary disease"],
  ["pneumonie comunitară", "community-acquired pneumonia"],
  ["sindrom(?:ul)? de hepatocitoliză", "hepatocellular injury (raised transaminases)"],
  ["hepatocitoliză", "hepatocellular injury"],
  ["sindrom(?:ul)? colestatic", "cholestasis"],
  ["colestază", "cholestasis"],
  ["sindrom(?:ul)? diareic", "diarrhoea"],
  ["sindrom(?:ul)? consumptiv", "weight loss (wasting syndrome)"],
  ["sindrom(?:ul)? inflamator", "inflammatory syndrome"],
  ["invaginație intestinală", "intestinal intussusception"],
  ["hernie ombilicală", "umbilical hernia"],
  ["malnutriție proteino-energetică", "protein-energy malnutrition"],
  ["chist(?:uri|e)? hepatic(?:e)?", "hepatic cysts"],
  ["hipopotasemie", "hypokalaemia"],
  ["hipokaliemie", "hypokalaemia"],
  ["hiponatremie", "hyponatraemia"],
  ["hipoproteinemie", "hypoproteinaemia"],
  ["hipertrigliceridemie", "hypertriglyceridaemia"],
  ["aerocolie", "colonic gaseous distension"],
  ["litiază biliară", "gallstones"],
  ["ciroză hepatică", "liver cirrhosis"],
  ["steatoză hepatică", "hepatic steatosis"],
  // Abbreviations (upper case only, so ordinary words are not touched)
  ["HTA", "arterial hypertension"],
  ["DZ", "diabetes mellitus"],
  ["BCR", "chronic kidney disease"],
  ["BPOC", "COPD"],
  ["ICC", "congestive heart failure"],
  ["CIC", "chronic ischaemic heart disease"],
  ["FiA", "atrial fibrillation"],
  ["IMA", "acute myocardial infarction"],
  ["AVC", "stroke"],
  ["TEP", "pulmonary embolism"],
  ["TVP", "deep vein thrombosis"],
  ["HLG", "complete blood count"],
  ["VSH", "ESR"],
  ["TA", "blood pressure"],
  ["AV", "heart rate"],
  ["EDS", "upper GI endoscopy"],
  ["EDI", "colonoscopy"],
  ["SCIV", "intravenous contrast"],
  ["ROT", "deep tendon reflexes"],
  ["RFG", "eGFR"],
  ["TGO", "AST"],
  ["TGP", "ALT"],
  ["GOT", "AST"],
  ["GPT", "ALT"],
  ["FA", "alkaline phosphatase"],
];

const ABBREVIATION = /^[A-Za-z]{2,5}$/;

export interface GlossaryEntry {
  re: RegExp;
  en: string;
  abbreviation: boolean;
}

function compile(pattern: string, en: string, caseSensitive: boolean): GlossaryEntry {
  return {
    re: new RegExp(`${W}(?:${loose(pattern)})${E}`, caseSensitive ? "gu" : "giu"),
    en,
    abbreviation: caseSensitive,
  };
}

const BUILT_IN_ENTRIES: GlossaryEntry[] = BUILT_IN.map(([ro, en]) =>
  // Abbreviations match exactly as written (upper case); phrases ignore case.
  compile(ro, en, ABBREVIATION.test(ro) && ro !== ro.toLowerCase()),
);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// User glossary: one "romanian = english" pair per line.
export function parseUserGlossary(text: string): GlossaryEntry[] {
  return text
    .split("\n")
    .map((line) => line.split("="))
    .filter((parts) => parts.length === 2 && parts[0].trim() && parts[1].trim())
    .map(([ro, en]) => compile(escapeRe(ro.trim()), en.trim(), false))
    .sort((a, b) => b.re.source.length - a.re.source.length);
}

// Replace known Romanian terms with English. User entries go first so they
// can override the built-in list. Placeholders like [PERSON] are left alone.
export function applyGlossary(segment: string, user: GlossaryEntry[] = []): { text: string; replaced: number } {
  let replaced = 0;
  let text = segment;
  for (const { re, en, abbreviation } of [...user, ...BUILT_IN_ENTRIES]) {
    re.lastIndex = 0;
    text = text.replace(re, (m, ...args) => {
      const offset = args[args.length - 2] as number;
      const whole = args[args.length - 1] as string;
      // Skip text inside a redaction placeholder.
      if (whole.lastIndexOf("[", offset) > whole.lastIndexOf("]", offset)) return m;
      replaced++;
      // Keep a capital letter at the start of a sentence or heading.
      return !abbreviation && /^\p{Lu}/u.test(m) ? en[0].toUpperCase() + en.slice(1) : en;
    });
  }
  return { text, replaced };
}
