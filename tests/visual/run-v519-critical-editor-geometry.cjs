const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');

const URL='http://127.0.0.1:4173/tests/visual/v519-critical-editor-geometry.html';

async function inspect(browserType,name,viewport){
  const browser=await browserType.launch({headless:true});
  try{
    const page=await browser.newPage({viewport});
    await page.goto(URL,{waitUntil:'networkidle'});
    const result=await page.evaluate(()=>{
      const layout=document.querySelector('[data-fixture-editor-layout]');
      const editor=document.querySelector('[data-fixture-editor-pane]');
      const preview=document.querySelector('[data-fixture-preview-pane]');
      const stage=document.querySelector('[data-fixture-preview-stage]');
      const pages=document.querySelector('[data-fixture-pages]');
      const a4=document.querySelector('[data-fixture-a4]');
      if(!layout||!editor||!preview||!stage||!pages||!a4)throw new Error('fixture nodes missing');
      const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
      return {
        layout:rect(layout),editor:rect(editor),preview:rect(preview),stage:rect(stage),pages:rect(pages),a4:rect(a4),
        previewDisplay:getComputedStyle(preview).display,
        a4ComputedWidth:getComputedStyle(a4).width,
        pagesComputedWidth:getComputedStyle(pages).width,
        bodyScrollWidth:document.body.scrollWidth,
        docScrollWidth:document.documentElement.scrollWidth,
        viewportWidth:window.innerWidth
      };
    });

    if(viewport.width>=1181){
      assert.ok(result.layout.width>=viewport.width-4,`${name} desktop layout should own the full viewport: ${JSON.stringify(result)}`);
      assert.ok(result.editor.width>=515,`${name} editor collapsed below usable width: ${JSON.stringify(result)}`);
      assert.ok(result.preview.width>=520,`${name} preview collapsed below usable width: ${JSON.stringify(result)}`);
      assert.notEqual(result.previewDisplay,'none',`${name} desktop preview must remain visible`);
      assert.ok(result.a4.width>=640&&result.a4.width<=665,`${name} transformed A4 should remain ~651px at 0.82 scale, got ${result.a4.width}`);
      assert.ok(parseFloat(result.a4ComputedWidth)>=790,`${name} physical A4 width was relaid out instead of scaled: ${result.a4ComputedWidth}`);
      assert.ok(parseFloat(result.pagesComputedWidth)>=790,`${name} invoice-pages root was allowed to shrink: ${result.pagesComputedWidth}`);
    }else if(viewport.width>=901){
      assert.equal(result.previewDisplay,'none',`${name} tablet preview should not reserve a hidden desktop track`);
      assert.ok(result.editor.width>=viewport.width-40,`${name} tablet editor should occupy the workspace: ${JSON.stringify(result)}`);
    }else{
      assert.equal(result.previewDisplay,'none',`${name} phone editor should keep preview on demand`);
      assert.ok(result.editor.width>=viewport.width-24,`${name} phone editor should occupy the workspace: ${JSON.stringify(result)}`);
    }
    assert.ok(result.bodyScrollWidth<=viewport.width+2,`${name} body has horizontal overflow: ${JSON.stringify(result)}`);
    assert.ok(result.docScrollWidth<=viewport.width+2,`${name} document has horizontal overflow: ${JSON.stringify(result)}`);
  }finally{await browser.close();}
}

(async()=>{
  for(const [type,name] of [[chromium,'chromium'],[webkit,'webkit']]){
    await inspect(type,name,{width:1440,height:900});
    await inspect(type,name,{width:1366,height:900});
    await inspect(type,name,{width:1024,height:900});
    await inspect(type,name,{width:390,height:844});
  }
  console.log('v519 quotation editor geometry QA passed in Chromium + WebKit at desktop, tablet and phone widths.');
})().catch(error=>{console.error(error);process.exit(1);});
