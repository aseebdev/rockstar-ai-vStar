/**
 * Rockstar AI intent router.
 *
 * The router is intentionally conservative: ordinary questions stay in the
 * normal text-chat path. Image generation/editing is selected only when the
 * user clearly asks for a visual action.
 */
(function (global) {
  'use strict';

  const IMAGE_NOUN = /\b(?:image|images|picture|pictures|photo|photos|illustration|illustrations|artwork|artworks|poster|posters|wallpaper|wallpapers|logo|logos|icon|icons|avatar|avatars|thumbnail|thumbnails|diagram|diagrams|drawing|drawings|graphic|graphics)\b/i;
  const GENERATE_VERB = /\b(?:generate|create|make|draw|render|design|produce|paint|illustrate)\b/i;
  const SHOW_VERB = /\b(?:show\s+me|give\s+me)\b/i;
  const EDIT_VERB = /\b(?:edit|modify|change|alter|transform|remove|replace|add|erase|retouch|enhance|resize|crop|rotate|restore|brighten|brighter|darken|sharpen|blur|background)\b/i;
  const CAPABILITY = /\b(?:can|could|do|does|is|are|will|would)\b[\s\S]{0,80}\b(?:you|rockstar|this|it)\b[\s\S]{0,100}\b(?:generate|create|make|draw|edit|image|images|picture|pictures|photo|photos|logo|poster)\b|\b(?:how|what|which|when|where|why)\b[\s\S]{0,100}\b(?:generate|create|make|draw|edit|image generation|images)\b/i;
  const QUESTION_START = /^(?:can|could|do|does|is|are|will|would|how|what|which|when|where|why|tell me|explain|is it possible)\b/i;
  // General capability language must stay in text chat. This intentionally
  // handles informal grammar such as "you can possible to create images?"
  // without treating a concrete request such as "create an image of a cat"
  // as a capability question.
  const GENERAL_CAPABILITY = /\b(?:possible|able|capable|available|supported|support(?:ed)?)\b[\s\S]{0,100}\b(?:create|generate|make|draw|edit)\b[\s\S]{0,100}\b(?:image|images|picture|pictures|photo|photos)\b|\b(?:create|generate|make|draw|edit)\b[\s\S]{0,80}\b(?:image|images|picture|pictures|photo|photos)\b[\s\S]{0,80}\b(?:possible|able|capable|available|supported)\b/i;
  const BARE_CAPABILITY = /^(?:can|could)\s+(?:you|rockstar)\s+(?:create|generate|make|draw|edit)\s+(?:an?\s+)?(?:image|images|picture|pictures|photo|photos)\s*\??$/i;
  const GENERAL_IMAGES_CAPABILITY = /\b(?:can|could|do|does|are|is)\b[\s\S]{0,80}\b(?:you|rockstar|it)\b[\s\S]{0,100}\b(?:images?|pictures?|photos?)\b[\s\S]{0,60}\b(?:now|at all|possible|available|supported|or not)\b/i;
  const CONCRETE_VISUAL_TARGET = /\b(?:image|images|picture|pictures|photo|photos|illustration|illustrations|artwork|poster|wallpaper|logo|icon|avatar|thumbnail|diagram|drawing|graphic)\b[\s\S]{0,40}\b(?:of|showing|depicting|featuring)\b/i;

  function normalize(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function isCapabilityQuestion(q) {
    if (!q) return false;
    const lower = q.toLowerCase();
    if (!/[?]$/.test(q) && !QUESTION_START.test(q) && !GENERAL_CAPABILITY.test(q)) return false;
    if (!IMAGE_NOUN.test(q) && !/image\s+generation|image\s+tool|visual\s+generation/i.test(q)) return false;

    // A concrete target such as "an image of a cat" is a real generation
    // request, even when phrased as "can you create...".
    if (CONCRETE_VISUAL_TARGET.test(q)) return false;

    // General capability questions should never invoke the image tool.
    if (GENERAL_CAPABILITY.test(q) || BARE_CAPABILITY.test(q) || GENERAL_IMAGES_CAPABILITY.test(q)) return true;
    if (/\b(?:not possible|possible|available|supported|can you|could you|do you|does it|what can you|how can i|how do i|what images can you)\b/i.test(lower)) return true;
    return CAPABILITY.test(q);
  }

  function isExplicitImageGeneration(q) {
    if (!q || isCapabilityQuestion(q)) return false;

    // Strong generation language + a visual noun anywhere nearby.
    if (GENERATE_VERB.test(q) && IMAGE_NOUN.test(q)) return true;
    if (/\b(?:draw|paint|illustrate)\b[\s\S]{0,100}\b(?:cat|dog|horse|donkey|car|bike|house|person|people|man|woman|portrait|character|landscape|scene|city|building|animal|diagram|flowchart)\b/i.test(q)) return true;
    if (!IMAGE_NOUN.test(q)) return false;
    if (SHOW_VERB.test(q) && /\b(?:image|picture|photo|illustration|artwork)\b/i.test(q)) return true;

    // Natural phrasing such as "an image of a donkey, please create it".
    if (IMAGE_NOUN.test(q) && /\b(?:of|for|showing)\b[\s\S]{0,120}\b(?:please|now|thanks|thank you)\b/i.test(q) && GENERATE_VERB.test(q)) return true;
    return false;
  }

  function isExplicitImageEdit(q, attachments) {
    const hasImage = Array.isArray(attachments) && attachments.some(a => a && a.kind === 'image' && a.dataUrl);
    if (!hasImage || isCapabilityQuestion(q)) return false;
    if (EDIT_VERB.test(q) && (IMAGE_NOUN.test(q) || /\b(?:this|attached|uploaded|photo|picture)\b/i.test(q))) return true;
    return false;
  }

  function classify(text, attachments) {
    const q = normalize(text);
    if (!q && !(Array.isArray(attachments) && attachments.length)) return 'text';
    if (isExplicitImageEdit(q, attachments)) return 'image-edit';
    if (isExplicitImageGeneration(q)) return 'image-generate';
    return 'text';
  }

  global.RockstarIntent = { normalize, isCapabilityQuestion, isExplicitImageGeneration, isExplicitImageEdit, classify };
})(window);
