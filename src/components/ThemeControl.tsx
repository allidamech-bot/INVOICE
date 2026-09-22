import { applyUiTheme, getUiThemePreference, resolveUiTheme, setUiThemePreference, type UiThemePreference } from '../lib/ui-theme.js';
import { Icon } from './UI.js';

interface Props {
  compact?:boolean;
  className?:string;
  language?:'en'|'ar';
}

interface State { preference:UiThemePreference; }

export class ThemeControl extends React.Component<Props,State>{
  state:State={preference:getUiThemePreference()};

  componentDidMount():void{
    applyUiTheme(this.state.preference,false);
    window.addEventListener('lourex-ui-theme-change',this.handleThemeChange as EventListener);
  }

  componentWillUnmount():void{
    window.removeEventListener('lourex-ui-theme-change',this.handleThemeChange as EventListener);
  }

  private handleThemeChange=(event:CustomEvent<{preference?:UiThemePreference}>)=>{
    const preference=event.detail?.preference??getUiThemePreference();
    if(preference!==this.state.preference)this.setState({preference});
  };

  private setTheme=(preference:UiThemePreference)=>{
    setUiThemePreference(preference);
    this.setState({preference});
  };

  render():any{
    const ar=this.props.language==='ar';
    const resolved=resolveUiTheme(this.state.preference);
    const next:UiThemePreference=resolved==='dark'?'light':'dark';
    const label=next==='dark'?(ar?'الوضع الليلي':'Dark mode'):(ar?'الوضع النهاري':'Light mode');
    return <div className={`mf-theme-control mf-theme-toggle-control ${this.props.compact?'is-compact':''} ${this.props.className||''}`}>
      <button type="button" className={`mf-theme-toggle is-${resolved}`} aria-label={label} title={label} onClick={()=>this.setTheme(next)}><Icon name={next==='dark'?'moon':'sun'}/>{this.props.compact?null:<strong>{label}</strong>}</button>
    </div>;
  }
}
