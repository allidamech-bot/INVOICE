import type { VaultPayload } from '../types.js';

type CompanyAssetRecord={id:string;dataUrl:string};
type AssetVault=VaultPayload&{companyAssets?:CompanyAssetRecord[]};
type SnapshotAssetField='logoDataUrl'|'signatureDataUrl'|'stampDataUrl';

const REF_PREFIX='lourex-asset:';
const DATA_URL_PREFIX='data:';
const SNAPSHOT_FIELDS:SnapshotAssetField[]=['logoDataUrl','signatureDataUrl','stampDataUrl'];

function isDataUrl(value:unknown):value is string{return typeof value==='string'&&value.startsWith(DATA_URL_PREFIX);}
function isAssetRef(value:unknown):value is string{return typeof value==='string'&&value.startsWith(REF_PREFIX)&&value.length>REF_PREFIX.length;}
function refId(value:string):string{return value.slice(REF_PREFIX.length);}
function refValue(id:string):string{return `${REF_PREFIX}${id}`;}

function hash32(value:string,seed:number):string{
  let hash=seed>>>0;
  for(let i=0;i<value.length;i+=1){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619)>>>0;}
  return hash.toString(36);
}
function baseAssetId(value:string):string{return `ca-${value.length.toString(36)}-${hash32(value,2166136261)}-${hash32(value,2246822519)}`;}

function snapshotList(vault:VaultPayload):any[]{
  const documents=Array.isArray(vault.documents)?vault.documents:[];
  const revisions=Array.isArray(vault.documentRevisions)?vault.documentRevisions:[];
  return [
    ...documents.map(document=>document?.companySnapshot).filter(Boolean),
    ...revisions.map(revision=>revision?.snapshot?.companySnapshot).filter(Boolean)
  ];
}

function normalizedAssets(vault:AssetVault):CompanyAssetRecord[]{
  const source=Array.isArray(vault.companyAssets)?vault.companyAssets:[];
  const result:CompanyAssetRecord[]=[];
  const ids=new Set<string>();
  for(const asset of source){
    if(!asset||typeof asset.id!=='string'||!asset.id||!isDataUrl(asset.dataUrl)||ids.has(asset.id))continue;
    ids.add(asset.id);result.push({id:asset.id,dataUrl:asset.dataUrl});
  }
  return result;
}

export function compactCompanySnapshotAssets(vault:VaultPayload):()=>void{
  const assetVault=vault as AssetVault;
  const assets=normalizedAssets(assetVault);
  const byId=new Map(assets.map(asset=>[asset.id,asset.dataUrl]));
  const byData=new Map(assets.map(asset=>[asset.dataUrl,asset.id]));
  const referenced=new Set<string>();
  const restored:Array<{snapshot:any;field:SnapshotAssetField;value:string}>=[];

  const register=(dataUrl:string):string=>{
    const existing=byData.get(dataUrl);if(existing)return existing;
    const base=baseAssetId(dataUrl);let id=base,index=1;
    while(byId.has(id)&&byId.get(id)!==dataUrl){id=`${base}-${index.toString(36)}`;index+=1;}
    if(!byId.has(id)){assets.push({id,dataUrl});byId.set(id,dataUrl);byData.set(dataUrl,id);}
    return id;
  };

  for(const snapshot of snapshotList(vault)){
    for(const field of SNAPSHOT_FIELDS){
      const value=typeof snapshot?.[field]==='string'?snapshot[field]:'';
      if(!value)continue;
      if(isAssetRef(value)){
        const id=refId(value);if(byId.has(id))referenced.add(id);
        continue;
      }
      if(!isDataUrl(value))continue;
      const id=register(value);referenced.add(id);restored.push({snapshot,field,value});snapshot[field]=refValue(id);
    }
  }

  assetVault.companyAssets=assets.filter(asset=>referenced.has(asset.id));
  return()=>{for(const entry of restored)entry.snapshot[entry.field]=entry.value;};
}

export function hydrateCompanySnapshotAssets(vault:VaultPayload):VaultPayload{
  const assetVault=vault as AssetVault;
  const assets=normalizedAssets(assetVault);
  const byId=new Map(assets.map(asset=>[asset.id,asset.dataUrl]));
  assetVault.companyAssets=assets;
  for(const snapshot of snapshotList(vault)){
    for(const field of SNAPSHOT_FIELDS){
      const value=typeof snapshot?.[field]==='string'?snapshot[field]:'';
      if(!isAssetRef(value))continue;
      const dataUrl=byId.get(refId(value));if(dataUrl)snapshot[field]=dataUrl;
    }
  }
  return vault;
}
