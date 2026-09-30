function normalizeType(type){if(!type)return'';return String(type).toLowerCase();}
export function normalizeSchema(schema){if(!schema||typeof schema!=='object')return null;const out={};for(const [key,value] of Object.entries(schema)){
  if(key==='type')out.type=normalizeType(value);
  else if(key==='properties'){out.properties={};for(const [name,child] of Object.entries(value||{}))out.properties[name]=normalizeSchema(child);}
  else if(key==='items')out.items=normalizeSchema(value);
  else if(key==='required')out.required=Array.isArray(value)?[...value]:[];
  else if(key==='enum')out.enum=Array.isArray(value)?[...value]:[];
  else if(key==='nullable')out.nullable=value===true;
  else if(['description','minimum','maximum','minItems','maxItems','additionalProperties'].includes(key))out[key]=value;
}
return out;}
export function toGeminiSchema(schema){const source=normalizeSchema(schema);if(!source)return null;const walk=node=>{const out={};for(const [key,value] of Object.entries(node)){
  if(key==='type')out.type=String(value).toUpperCase();
  else if(key==='properties'){out.properties={};for(const [name,child] of Object.entries(value))out.properties[name]=walk(child);}
  else if(key==='items')out.items=walk(value);
  else out[key]=value;
}return out;};return walk(source);}
function isType(value,type){if(type==='object')return !!value&&typeof value==='object'&&!Array.isArray(value);if(type==='array')return Array.isArray(value);if(type==='string')return typeof value==='string';if(type==='number')return typeof value==='number'&&Number.isFinite(value);if(type==='integer')return Number.isInteger(value);if(type==='boolean')return typeof value==='boolean';return true;}
export function validateAndProject(value,schema,path='$'){const node=normalizeSchema(schema);if(!node)return{ok:true,value};if(value===null&&node.nullable)return{ok:true,value:null};if(node.type&&!isType(value,node.type))return{ok:false,error:`${path} must be ${node.type}`};if(node.enum&&!node.enum.includes(value))return{ok:false,error:`${path} is outside enum`};
  if(node.type==='object'){
    const required=new Set(node.required||[]);const projected={};
    for(const name of required)if(value?.[name]===undefined)return{ok:false,error:`${path}.${name} is required`};
    for(const [name,child] of Object.entries(node.properties||{})){if(value?.[name]===undefined)continue;const result=validateAndProject(value[name],child,`${path}.${name}`);if(!result.ok)return result;projected[name]=result.value;}
    return{ok:true,value:projected};
  }
  if(node.type==='array'){
    if(node.minItems!==undefined&&value.length<node.minItems)return{ok:false,error:`${path} has too few items`};if(node.maxItems!==undefined&&value.length>node.maxItems)return{ok:false,error:`${path} has too many items`};const projected=[];for(let i=0;i<value.length;i++){const result=validateAndProject(value[i],node.items,`${path}[${i}]`);if(!result.ok)return result;projected.push(result.value);}return{ok:true,value:projected};
  }
  return{ok:true,value};
}
export function schemaInstruction(schema){return JSON.stringify(normalizeSchema(schema));}
