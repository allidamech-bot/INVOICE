export type OpportunityStage='lead'|'contacted'|'rfq-received'|'quote-sent'|'negotiation'|'won'|'lost';

export interface OpportunityRecord{
  id:string;
  createdAt:string;
  updatedAt:string;
  title:string;
  stage:OpportunityStage;
  customerId:string;
  partyName:string;
  contactPerson:string;
  email:string;
  phone:string;
  value:string;
  currency:string;
  expectedCloseDate:string;
  nextAction:string;
  nextActionDate:string;
  notes:string;
  lostReason:string;
  linkedDocumentIds:string[];
}

declare module './types.js'{
  interface VaultPayload{
    opportunities:OpportunityRecord[];
  }
}
