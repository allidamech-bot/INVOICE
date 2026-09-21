import { applyUiTheme, getUiThemePreference, setUiThemePreference, type UiThemePreference } from '../lib/ui-theme.js';
import { Icon, type IconName } from './UI.js';

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
    const options:Array<{value:UiThemePreference;icon:IconName;en:string;ar:string}>=[
      {value:'system',icon:'system',en:'System',ar:'النظام'},
      {value:'light',icon:'sun',en:'Light',ar:'فاتح'},
      {value:'dark',icon:'moon',en:'Dark',ar:'داكن'},
    ];
    return <div className={`mf-theme-control ${this.props.compact?'is-compact':''} ${this.props.className||''}`} role="group" aria-label={ar?'مظهر التطبيق':'App appearance'}>
      {options.map(option=><button key={option.value} type="button" className={this.state.preference===option.value?'active':''} aria-pressed={this.state.preference===option.value} title={ar?option.ar:option.en} onClick={()=>this.setTheme(option.value)}><Icon name={option.icon}/>{this.props.compact?null:<strong>{ar?option.ar:option.en}</strong>}</button>)}
    </div>;
  }
}
