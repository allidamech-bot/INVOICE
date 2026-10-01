from pathlib import Path

for path in ['src/components/FxPage.tsx','src/components/TreasuryPage.tsx']:
    p=Path(path); text=p.read_text()
    text=text.replace('onChange={event=>', 'onChange={(event:any)=>')
    # Balance the added parenthesis before the callback expression closes.
    text=text.replace('setFromCurrency(event.target.value)}>', 'setFromCurrency(event.target.value)}>}') if False else text
    # JSX arrow syntax only needs the typed parameter wrapped; normalize known patterns.
    text=text.replace("onChange={(event:any)=>setFromCurrency(event.target.value)}", "onChange={(event:any)=>setFromCurrency(event.target.value)}")
    text=text.replace("onChange={(event:any)=>setSourceAmount(event.target.value)}", "onChange={(event:any)=>setSourceAmount(event.target.value)}")
    text=text.replace("onChange={(event:any)=>setRate(event.target.value)}", "onChange={(event:any)=>setRate(event.target.value)}")
    text=text.replace("onChange={(event:any)=>setToCurrency(event.target.value)}", "onChange={(event:any)=>setToCurrency(event.target.value)}")
    text=text.replace("onChange={(event:any)=>setCurrency(event.target.value)}", "onChange={(event:any)=>setCurrency(event.target.value)}")
    p.write_text(text)
print('Finance handler types normalized')
