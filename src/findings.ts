// Rule-based detection of clinical signs and symptoms in English text (the
// note itself or its on-device translation). The OpenMed browser models
// recognise named diseases and drugs, not findings such as "pale mucous
// membranes" or "underweight", so these are matched from a curated list.
// Negation ("no murmurs") is handled later by isNegated().
//
// Terms are regex fragments; `(?:o)?e` style groups cover UK/US spellings.
// Ambiguous everyday words are only listed in a specific form (e.g. "nasal
// discharge", never bare "discharge", which usually means hospital discharge).

import type { Span } from "./entities";

const GENERAL = [
  "underweight(?: nutritional status)?", "weight loss", "unintentional weight loss", "weight gain",
  "cachexia", "cachectic", "wasting", "reduced subcutaneous fat", "failure to thrive",
  "fatigue", "tiredness", "lethargy", "lethargic", "asthenia", "malaise", "(?:generali[sz]ed )?weakness",
  "fever", "febrile", "pyrexia", "hyperthermia", "hypothermia", "low-grade fever", "high fever",
  "chills", "rigors", "night sweats", "(?:excessive )?sweating", "diaphoresis", "hyperhidrosis",
  "anorexia", "loss of appetite", "decreased appetite", "poor appetite", "increased appetite", "polyphagia",
  "polydipsia", "excessive thirst", "dehydrat(?:ed|ion)", "(?:mildly|moderately|severely) dehydrated",
  "hot flushes", "hot flashes", "flushing", "cold intolerance", "heat intolerance",
  "sleep disturbance", "insomnia", "hypersomnia", "daytime sleepiness", "snoring",
  "chronic pain", "bone pain", "muscle pain", "myalgias?", "arthralgias?", "joint pain", "body aches",
];

const SKIN = [
  "hyperpigment(?:ed|ation)(?: (?:skin|of the skin))?", "hyperpigmented skin", "hypopigment(?:ed|ation)",
  "depigmentation", "pallor", "pale(?: skin| mucous membranes| conjunctivae| lips)?",
  "jaundice", "jaundiced(?: skin)?", "icterus", "icteric(?: sclerae)?", "scleral icterus", "subicterus",
  "cyanosis", "cyanotic", "central cyanosis", "peripheral cyanosis", "acrocyanosis", "mottled skin", "mottling",
  "erythema", "erythematous", "redness", "rash", "maculopapular rash", "vesicular rash", "urticaria", "hives",
  "wheals", "petechiae", "purpura", "ecchymos(?:is|es)", "bruising", "easy bruising", "ha?ematomas?",
  "pruritus", "itching", "itchy skin", "dry skin", "xerosis", "skin lesions?", "skin ulcers?", "pressure ulcers?",
  "(?:decubitus|venous|diabetic foot) ulcers?", "blisters?", "bullae", "vesicles", "pustules", "papules",
  "skin nodules", "plaques", "scaling", "desquamation", "alopecia", "hair loss", "hirsutism", "nail clubbing",
  "clubbing", "koilonychia", "spider na?evi", "palmar erythema", "telangiectasias?",
  "xanthomas?", "xanthelasma", "livedo reticularis", "cellulitis", "abscess", "wound infection",
  "delayed wound healing", "(?:reduced|poor|decreased) skin turgor", "skin tenting", "dry mucous membranes",
  "dry mouth", "xerostomia", "cold (?:and clammy )?extremities", "clammy skin",
];

const HEAD_EYES_ENT = [
  "headaches?", "cephalalgia", "migraine", "facial pain", "facial swelling", "facial (?:droop|asymmetry)",
  "dizziness", "vertigo", "light-?headedness", "presyncope", "syncope", "fainting", "blackouts?",
  "blurred vision", "blurring of vision", "double vision", "diplopia", "visual loss", "loss of vision",
  "visual disturbances?", "photophobia", "eye pain", "red eyes?", "conjunctival (?:injection|hypera?emia)",
  "conjunctivitis", "periorbital o?edema", "ptosis", "proptosis", "exophthalmos", "nystagmus",
  "anisocoria", "(?:fixed|dilated|pinpoint) pupils", "mydriasis", "miosis", "papill?o?edema",
  "tinnitus", "hearing loss", "deafness", "ear pain", "otalgia", "ear discharge", "otorrh(?:o)?ea",
  "nasal congestion", "nasal obstruction", "runny nose", "rhinorrh(?:o)?ea", "nasal discharge", "sneezing",
  "epistaxis", "nosebleeds?", "loss of smell", "anosmia", "loss of taste", "ageusia", "dysgeusia",
  "sore throat", "pharyngitis", "odynophagia", "dysphagia", "difficulty swallowing", "hoarseness",
  "dysphonia", "voice changes?", "stridor", "oral ulcers?", "mouth ulcers?", "aphthous ulcers?",
  "gingival bleeding", "bleeding gums", "glossitis", "cheilitis", "angular stomatitis", "oral thrush",
  "halitosis", "tonsillar (?:enlargement|hypertrophy|exudate)", "enlarged tonsils", "goitre", "goiter",
  "neck (?:mass|swelling|pain)", "neck stiffness", "nuchal rigidity",
];

const CARDIO_RESP = [
  "chest pain", "chest tightness", "chest discomfort", "retrosternal pain", "angina", "anginal pain",
  "pleuritic (?:chest )?pain", "palpitations", "tachycardia", "bradycardia", "arrhythmia",
  "irregular (?:pulse|heartbeat|heart rhythm)", "irregularly irregular (?:pulse|rhythm)",
  "(?:systolic |diastolic |pansystolic |ejection )?murmurs?", "gallop rhythm", "third heart sound", "fourth heart sound",
  "pericardial (?:friction )?rub", "raised JVP", "(?:elevated|raised) jugular venous pressure",
  "jugular venous distension", "hypotension", "hypertension", "orthostatic hypotension", "postural hypotension",
  "(?:elevated|high|raised) blood pressure", "low blood pressure", "shock", "weak pulse", "thready pulse",
  "absent (?:peripheral |distal )?pulses", "(?:diminished|reduced|weak) (?:peripheral |distal )?pulses",
  "bounding pulse", "prolonged capillary refill", "delayed capillary refill", "claudication",
  "intermittent claudication", "cold (?:feet|hands)",
  "dyspn(?:o)?ea", "shortness of breath", "breathlessness", "(?:exertional|resting|nocturnal) dyspn(?:o)?ea",
  "dyspn(?:o)?ea on exertion", "orthopn(?:o)?ea", "paroxysmal nocturnal dyspn(?:o)?ea", "tachypn(?:o)?ea",
  "bradypn(?:o)?ea", "apn(?:o)?ea", "respiratory distress", "increased work of breathing",
  "use of accessory muscles", "(?:intercostal |subcostal )retractions", "nasal flaring", "cough", "dry cough",
  "productive cough", "chronic cough", "sputum(?: production)?", "purulent sputum", "ha?emoptysis",
  "blood-stained sputum", "wheez(?:e|es|ing)", "(?:fine |coarse |basal |bibasal |bibasilar )?(?:crackles|crepitations)",
  "rales", "rhonchi", "pleural rub", "(?:diminished|decreased|reduced|absent) breath sounds", "bronchial breathing",
  "dullness to percussion", "hyperresonance", "hypoxi(?:a|aemia|emia)", "(?:low|reduced) oxygen saturation",
  "desaturation", "hypercapnia", "respiratory failure", "barrel chest", "chest wall tenderness",
];

const ABDOMEN = [
  "abdominal pain", "epigastric pain", "(?:right|left) (?:upper|lower) quadrant pain", "periumbilical pain",
  "suprapubic pain", "flank pain", "loin pain", "colicky pain", "abdominal cramps?", "cramping",
  "abdominal (?:distension|distention|bloating)", "distended abdomen", "bloating", "flatulence", "excessive gas",
  "abdominal (?:tenderness|guarding|rigidity)", "tenderness on palpation", "tender on palpation", "guarding",
  "rebound tenderness", "peritonism", "peritoneal irritation", "(?:positive )?Murphy'?s sign",
  "McBurney'?s point tenderness", "Rovsing'?s sign", "abdominal mass", "palpable mass", "hepatomegaly",
  "splenomegaly", "hepatosplenomegaly", "enlarged liver", "enlarged spleen",
  String.raw`liver(?: la| at| is)? (?:\d+(?:[.,]\d+)? ?cm|palpable) below the (?:right )?costal margin`,
  "ascites", "shifting dullness", "fluid thrill", "caput medusae",
  "(?:absent|reduced|increased|hyperactive|hypoactive) bowel sounds",
  "nausea", "vomiting", "retching", "emesis", "projectile vomiting", "ha?ematemesis",
  "coffee-ground (?:vomit|vomiting|vomitus)", "heartburn", "acid reflux", "regurgitation", "dyspepsia", "indigestion",
  "early satiety", "hiccups?", "belching", "diarrh(?:o)?ea", "watery diarrh(?:o)?ea", "bloody diarrh(?:o)?ea",
  "loose stools", "frequent stools", "constipation", "obstipation", "tenesmus", "f(?:a)?ecal incontinence",
  "mela?ena", "black (?:tarry )?stools", "ha?ematochezia", "rectal bleeding", "blood in (?:the )?stools?",
  "steatorrh(?:o)?ea", "pale stools", "clay-colou?red stools", "change in bowel habits?", "anal pain",
  "perianal pain", "pruritus ani", "umbilical hernia", "inguinal hernia", "incisional hernia", "hernia",
];

const URO_GENITAL = [
  "dysuria", "painful urination", "burning (?:on|with) urination", "urinary frequency", "frequency of urination",
  "urinary urgency", "nocturia", "polyuria", "oliguria", "anuria", "urinary retention",
  "retention of urine", "incomplete (?:bladder )?emptying", "urinary hesitancy", "weak (?:urinary )?stream",
  "terminal dribbling", "urinary incontinence", "stress incontinence", "ha?ematuria",
  "(?:macroscopic|microscopic|gross|visible) ha?ematuria", "blood in (?:the )?urine", "cloudy urine",
  "foul-smelling urine", "dark urine", "foamy urine", "proteinuria", "(?:positive )?costovertebral angle tenderness",
  "renal angle tenderness", "suprapubic tenderness", "scrotal (?:pain|swelling)", "testicular (?:pain|swelling)",
  "erectile dysfunction", "vaginal (?:bleeding|discharge)", "postmenopausal bleeding", "intermenstrual bleeding",
  "menorrhagia", "heavy menstrual bleeding", "amenorrh(?:o)?ea", "dysmenorrh(?:o)?ea", "pelvic pain",
  "dyspareunia", "breast (?:lump|mass|pain|tenderness)", "nipple discharge", "galactorrh(?:o)?ea", "gyn(?:a)?ecomastia",
];

const MUSCULOSKELETAL = [
  "back pain", "low(?:er)? back pain", "neck pain", "shoulder pain", "hip pain", "knee pain", "joint swelling",
  "swollen joints?", "joint stiffness", "morning stiffness", "(?:limited|reduced|restricted) range of motion",
  "joint effusion", "joint deformity", "synovitis", "muscle weakness", "proximal (?:muscle )?weakness",
  "muscle cramps?", "muscle spasms?", "muscle wasting", "muscle atrophy", "gait disturbance",
  "difficulty walking", "inability to bear weight", "bone tenderness", "spinal tenderness", "kyphosis", "scoliosis",
  "crepitus", "leg pain", "calf (?:pain|tenderness|swelling)", "limb (?:pain|swelling)", "leg swelling",
  "(?:(?:leg|ankle|pedal|peripheral|pitting|lower limb|bilateral|unilateral|sacral|generali[sz]ed|mild|marked|severe) ){0,3}o?edema",
  "anasarca",
];

const NEURO_PSYCH = [
  "confusion", "confused", "disorientation", "disoriented", "delirium", "agitation", "restlessness",
  "altered (?:mental status|level of consciousness|consciousness)", "decreased level of consciousness",
  "loss of consciousness", "unconsciousness", "coma", "drowsiness", "drowsy", "somnolence", "stupor", "obtundation",
  "memory loss", "memory impairment", "forgetfulness", "cognitive (?:decline|impairment)", "amnesia",
  "seizures?", "convulsions?", "tonic-clonic seizures?", "focal seizures?",
  "tremor", "resting tremor", "intention tremor", "rigidity", "cogwheel rigidity", "bradykinesia", "ataxia",
  "unsteady gait", "gait ataxia", "recurrent falls", "dysarthria", "slurred speech", "aphasia", "dysphasia",
  "speech difficulty", "hemiparesis", "hemiplegia", "paraparesis", "paraplegia", "tetraparesis", "quadriplegia",
  "facial palsy", "facial weakness", "limb weakness", "arm weakness", "leg weakness", "numbness", "tingling",
  "pa?r(?:a)?esthesias?", "pins and needles", "hypo(?:a)?esthesia", "sensory loss", "loss of sensation",
  "neuropathic pain", "burning pain", "radicular pain", "sciatica", "(?:brisk|exaggerated|increased) reflexes",
  "hyperreflexia", "hyporeflexia", "areflexia", "(?:absent|diminished|reduced) (?:deep tendon )?reflexes",
  "(?:positive |extensor )?Babinski(?: sign)?", "clonus", "spasticity", "meningeal (?:irritation|signs)",
  "(?:positive )?Kernig'?s sign", "(?:positive )?Brudzinski'?s sign", "focal neurological (?:signs|deficits?)",
  "neurological deficits?", "visual field defects?", "hemianopia",
  "anxiety", "anxious", "panic attacks?", "depressed mood", "low mood", "anhedonia",
  "irritability", "mood swings", "apathy", "suicidal (?:ideation|thoughts)", "self-harm", "hallucinations",
  "delusions", "paranoia", "psychosis", "psychomotor (?:agitation|retardation)", "poor concentration",
];

const ENDOCRINE_HAEM = [
  "hypoglyc(?:a)?emia", "hyperglyc(?:a)?emia", "moon face", "buffalo hump", "(?:purple |abdominal )?striae",
  "central obesity", "obesity", "overweight",
  "(?:(?:cervical|axillary|inguinal|supraclavicular|generali[sz]ed|palpable|tender|painless|bilateral) ){0,3}lymphadenopathy",
  "swollen lymph nodes", "enlarged lymph nodes", "bleeding tendency", "prolonged bleeding",
  "recurrent infections",
];

// Laboratory-described findings that read like findings in notes.
const LAB_LIKE = [
  "hypokal(?:a)?emia", "hyperkal(?:a)?emia", "hyponatr(?:a)?emia", "hypernatr(?:a)?emia", "hypocalc(?:a)?emia",
  "hypercalc(?:a)?emia", "hypomagnes(?:a)?emia", "hypoprotein(?:a)?emia", "hypoalbumin(?:a)?emia",
  "hypertriglycerid(?:a)?emia", "hypercholesterol(?:a)?emia", "leu[kc]ocytosis", "leu[kc]openia",
  "neutropenia", "neutrophilia", "lymphopenia", "thrombocytopenia", "thrombocytosis",
  "(?:raised|elevated|increased) (?:inflammatory markers|CRP|ESR|transaminases|liver enzymes|creatinine|troponin|lactate|D-dimer)",
  "hepatocellular injury", "cholestasis", "azot(?:a)?emia", "acidosis", "alkalosis", "ketonuria", "glycosuria",
];

const FINDINGS = [
  ...new Set([
    ...GENERAL, ...SKIN, ...HEAD_EYES_ENT, ...CARDIO_RESP, ...ABDOMEN,
    ...URO_GENITAL, ...MUSCULOSKELETAL, ...NEURO_PSYCH, ...ENDOCRINE_HAEM, ...LAB_LIKE,
  ]),
];

export const FINDING_COUNT = FINDINGS.length;

// Longer alternatives first, so "abdominal pain" wins over "pain"-style
// shorter matches starting at the same position.
const FINDING_RE = new RegExp(
  String.raw`(?<![\p{L}\p{N}-])(?:${[...FINDINGS].sort((a, b) => b.length - a.length).join("|")})(?![\p{L}\p{N}])`,
  "giu",
);

export function findSignsAndSymptoms(text: string): Span[] {
  const out: Span[] = [];
  FINDING_RE.lastIndex = 0;
  for (const m of text.matchAll(FINDING_RE)) {
    // A slightly lower score than the models, so a model's disease span wins
    // where both apply.
    out.push({ start: m.index!, end: m.index! + m[0].length, label: "FINDING", score: 0.6 });
  }
  return out;
}
