export const AI_FREE_ONLY=true;

export const AI_CAPABILITIES=Object.freeze({
  TEXT:'TEXT',
  VISION:'VISION',
  STRUCTURED_OUTPUT:'STRUCTURED_OUTPUT',
  DEEP_REASONING:'DEEP_REASONING',
  TOOL_CALLING:'TOOL_CALLING',
  LARGE_CONTEXT:'LARGE_CONTEXT',
  NATIVE_DOCUMENT:'NATIVE_DOCUMENT'
});

const C=AI_CAPABILITIES;

export const AI_MODELS=Object.freeze([
  Object.freeze({provider:'groq',model:'qwen/qwen3.8-27b',enabled:true,freeOnly:true,priority:10,capabilities:[C.TEXT,C.VISION,C.STRUCTURED_OUTPUT,C.LARGE_CONTEXT],structuredMode:'json_object',maxImages:3}),
  Object.freeze({provider:'groq',model:'openai/gpt-oss-120b',enabled:true,freeOnly:true,priority:10,capabilities:[C.TEXT,C.STRUCTURED_OUTPUT,C.DEEP_REASONING,C.LARGE_CONTEXT],structuredMode:'json_schema'}),
  Object.freeze({provider:'cloudflare',model:'@cf/google/gemma-4-26b-a4b-it',enabled:true,freeOnly:true,priority:20,capabilities:[C.TEXT,C.VISION,C.STRUCTURED_OUTPUT,C.LARGE_CONTEXT,C.TOOL_CALLING],structuredMode:'json_schema'}),
  Object.freeze({provider:'cloudflare',model:'@cf/nvidia/nemotron-3-120b-a12b',enabled:true,freeOnly:true,priority:20,capabilities:[C.TEXT,C.STRUCTURED_OUTPUT,C.DEEP_REASONING,C.LARGE_CONTEXT],structuredMode:'json_schema'}),
  Object.freeze({provider:'cloudflare',model:'@cf/openai/gpt-oss-120b',enabled:true,freeOnly:true,priority:30,capabilities:[C.TEXT,C.STRUCTURED_OUTPUT,C.DEEP_REASONING,C.LARGE_CONTEXT],structuredMode:'json_schema'}),
  Object.freeze({provider:'gemini',model:'gemini-2.5-flash-lite',enabled:true,freeOnly:true,priority:90,capabilities:[C.TEXT,C.VISION,C.STRUCTURED_OUTPUT,C.LARGE_CONTEXT,C.NATIVE_DOCUMENT],structuredMode:'json_schema'})
]);

export const AI_ROUTES=Object.freeze({
  general:Object.freeze([
    ['groq','qwen/qwen3.8-27b'],
    ['cloudflare','@cf/google/gemma-4-26b-a4b-it'],
    ['gemini','gemini-2.5-flash-lite']
  ]),
  vision:Object.freeze([
    ['groq','qwen/qwen3.8-27b'],
    ['cloudflare','@cf/google/gemma-4-26b-a4b-it'],
    ['gemini','gemini-2.5-flash-lite']
  ]),
  deep:Object.freeze([
    ['groq','openai/gpt-oss-120b'],
    ['cloudflare','@cf/nvidia/nemotron-3-120b-a12b'],
    ['cloudflare','@cf/openai/gpt-oss-120b'],
    ['gemini','gemini-2.5-flash-lite']
  ]),
  nativeDocument:Object.freeze([
    ['gemini','gemini-2.5-flash-lite']
  ])
});

export function getModel(provider,model){return AI_MODELS.find(entry=>entry.provider===provider&&entry.model===model)||null;}
export function hasCapabilities(entry,required=[]){return required.every(capability=>entry.capabilities.includes(capability));}
