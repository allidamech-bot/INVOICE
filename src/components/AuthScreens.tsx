import type { CompanySettings } from '../types.js';
import { Brand, Button, Field, Input } from './UI.js';
import { fileToDataUrl } from '../lib/files.js';

interface SetupProps {
  onFinish: (pin: string, company: CompanySettings) => Promise<void>;
  initialCompany: CompanySettings;
}
interface SetupState { welcome: boolean; step: 1|2|3; pin: string; confirm: string; company: CompanySettings; error: string; busy: boolean; }

export class SetupScreen extends React.Component<SetupProps, SetupState> {
  state: SetupState = { welcome: true, step: 1, pin: '', confirm: '', company: this.props.initialCompany, error: '', busy: false };

  private updateCompany = (key: keyof CompanySettings, value: any): void => this.setState({ company: { ...this.state.company, [key]: value } });
  private updateBank = (key: keyof CompanySettings['bank'], value: string): void => this.setState({ company: { ...this.state.company, bank: { ...this.state.company.bank, [key]: value } } });
  private upload = async (field: 'logoDataUrl'|'signatureDataUrl'|'stampDataUrl', file?: File): Promise<void> => {
    if (!file) return;
    try { const data = await fileToDataUrl(file); this.updateCompany(field, data); }
    catch (e) { this.setState({ error: e instanceof Error ? e.message : 'Unable to read image.' }); }
  };
  private next = (): void => {
    if (this.state.step === 1) {
      if (!/^\d{4,12}$/.test(this.state.pin)) return this.setState({ error: 'Use a 4–12 digit PIN.' });
      if (this.state.pin !== this.state.confirm) return this.setState({ error: 'PIN confirmation does not match.' });
      this.setState({ step: 2, error: '' }); return;
    }
    if (this.state.step === 2) {
      if (!this.state.company.nameEn.trim()) return this.setState({ error: 'Company name is required.' });
      this.setState({ step: 3, error: '' }); return;
    }
  };
  private finish = async (): Promise<void> => {
    this.setState({ busy: true, error: '' });
    try { await this.props.onFinish(this.state.pin, this.state.company); }
    catch (e) { this.setState({ error: e instanceof Error ? e.message : 'Setup failed.', busy: false }); }
  };
  render(): any {
    const { step, company, busy, error } = this.state;
    if (this.state.welcome) return <div className="auth-page"><div className="auth-card unlock-card welcome-card"><Brand/><p className="eyebrow">LOUREX Invoice</p><h1>Welcome.</h1><p className="subtle">Create, save and share professional Proforma Invoices and Invoices. Everything stays on this device.</p><Button variant="primary" onClick={()=>this.setState({welcome:false})}>Set Up</Button><p className="security-note">Local-first · Encrypted · No cloud account</p></div></div>;
    return <div className="auth-page"><div className="auth-card setup-card"><Brand/><div className="setup-progress"><span className={step >= 1 ? 'active' : ''}>1</span><i/><span className={step >= 2 ? 'active' : ''}>2</span><i/><span className={step >= 3 ? 'active' : ''}>3</span></div>
      {step === 1 ? <div className="auth-section"><p className="eyebrow">Security</p><h1>Set your access PIN</h1><p className="subtle">Your data stays encrypted on this device. The PIN is never stored as plain text.</p><div className="form-grid one"><Field label="PIN"><Input inputMode="numeric" autoComplete="new-password" maxLength="12" type="password" value={this.state.pin} onChange={(e:any)=>this.setState({pin:e.target.value.replace(/\D/g,'')})}/></Field><Field label="Confirm PIN"><Input inputMode="numeric" maxLength="12" type="password" value={this.state.confirm} onChange={(e:any)=>this.setState({confirm:e.target.value.replace(/\D/g,'')})}/></Field></div><Button variant="primary" onClick={this.next}>Continue</Button></div> : null}
      {step === 2 ? <div className="auth-section"><p className="eyebrow">Company</p><h1>Company details</h1><div className="form-grid two">
        <Field label="Company Name English"><Input value={company.nameEn} onChange={(e:any)=>this.updateCompany('nameEn',e.target.value)}/></Field>
        <Field label="Company Name Arabic"><Input dir="rtl" value={company.nameAr} onChange={(e:any)=>this.updateCompany('nameAr',e.target.value)}/></Field>
        <Field label="Address English"><Input value={company.addressEn} onChange={(e:any)=>this.updateCompany('addressEn',e.target.value)}/></Field>
        <Field label="Address Arabic"><Input dir="rtl" value={company.addressAr} onChange={(e:any)=>this.updateCompany('addressAr',e.target.value)}/></Field>
        <Field label="City"><Input value={company.city} onChange={(e:any)=>this.updateCompany('city',e.target.value)}/></Field>
        <Field label="Country"><Input value={company.country} onChange={(e:any)=>this.updateCompany('country',e.target.value)}/></Field>
        <Field label="Phone"><Input value={company.phone} onChange={(e:any)=>this.updateCompany('phone',e.target.value)}/></Field>
        <Field label="Email"><Input type="email" value={company.email} onChange={(e:any)=>this.updateCompany('email',e.target.value)}/></Field>
        <Field label="Website"><Input value={company.website} onChange={(e:any)=>this.updateCompany('website',e.target.value)}/></Field>
        <Field label="Commercial Registration"><Input value={company.commercialRegistration} onChange={(e:any)=>this.updateCompany('commercialRegistration',e.target.value)}/></Field>
      </div><label className="upload-tile"><span>Company Logo</span><img src={company.logoDataUrl || './brand/lourex-logo.svg'} alt="Company logo preview"/><input type="file" accept="image/png,image/webp,image/jpeg,image/svg+xml" onChange={(e:any)=>this.upload('logoDataUrl',e.target.files?.[0])}/></label><div className="setup-actions"><Button onClick={()=>this.setState({step:1})}>Back</Button><Button variant="primary" onClick={this.next}>Continue</Button></div></div> : null}
      {step === 3 ? <div className="auth-section"><p className="eyebrow">Optional</p><h1>Bank & signing</h1><div className="form-grid two">
        <Field label="Bank Name"><Input value={company.bank.bankName} onChange={(e:any)=>this.updateBank('bankName',e.target.value)}/></Field>
        <Field label="Account Name"><Input value={company.bank.accountName} onChange={(e:any)=>this.updateBank('accountName',e.target.value)}/></Field>
        <Field label="IBAN"><Input value={company.bank.iban} onChange={(e:any)=>this.updateBank('iban',e.target.value)}/></Field>
        <Field label="SWIFT / BIC"><Input value={company.bank.swift} onChange={(e:any)=>this.updateBank('swift',e.target.value)}/></Field>
      </div><div className="upload-row"><label className="upload-tile small"><span>Signature</span>{company.signatureDataUrl ? <img src={company.signatureDataUrl} alt="Signature"/> : <b>Upload</b>}<input type="file" accept="image/png,image/webp,image/jpeg" onChange={(e:any)=>this.upload('signatureDataUrl',e.target.files?.[0])}/></label><label className="upload-tile small"><span>Stamp</span>{company.stampDataUrl ? <img src={company.stampDataUrl} alt="Stamp"/> : <b>Upload</b>}<input type="file" accept="image/png,image/webp,image/jpeg" onChange={(e:any)=>this.upload('stampDataUrl',e.target.files?.[0])}/></label></div><div className="setup-actions"><Button onClick={()=>this.setState({step:2})}>Back</Button><Button variant="primary" disabled={busy} onClick={this.finish}>{busy ? 'Finishing…' : 'Finish'}</Button></div></div> : null}
      {error ? <div className="auth-error">{error}</div> : null}
    </div></div>;
  }
}

interface UnlockProps { onUnlock: (pin: string) => Promise<void>; }
interface UnlockState { pin: string; error: string; busy: boolean; }
export class UnlockScreen extends React.Component<UnlockProps, UnlockState> {
  state: UnlockState = { pin: '', error: '', busy: false };
  private submit = async (e:any): Promise<void> => { e.preventDefault(); if (!this.state.pin) return; this.setState({busy:true,error:''}); try { await this.props.onUnlock(this.state.pin); } catch (err) { this.setState({busy:false,error:err instanceof Error?err.message:'Unable to unlock.',pin:''}); } };
  render(): any { return <div className="auth-page"><form className="auth-card unlock-card" onSubmit={this.submit}><Brand/><p className="eyebrow">LOUREX Invoice</p><h1>Enter PIN</h1><Field label="Access PIN"><Input autoFocus inputMode="numeric" type="password" value={this.state.pin} onChange={(e:any)=>this.setState({pin:e.target.value.replace(/\D/g,'')})}/></Field>{this.state.error ? <div className="auth-error">{this.state.error}</div> : null}<Button variant="primary" type="submit" disabled={this.state.busy}>{this.state.busy?'Unlocking…':'Unlock'}</Button><p className="security-note">Encrypted local access · No cloud account</p></form></div>; }
}
