const CITIES=[
 ['Antwerpen',51.2194,4.4025],['Brussel',50.8503,4.3517],
 ['Gent',51.0543,3.7174],['Brugge',51.2093,3.2247],
 ['Leuven',50.8798,4.7005],['Hasselt',50.9307,5.3325],
 ['Mechelen',51.0259,4.4775],['Kortrijk',50.827,3.265],
 ['Luik',50.6326,5.5797],['Amsterdam',52.3676,4.9041],
 ['Rotterdam',51.9244,4.4777],['Maastricht',50.8514,5.691]
];
const VERSION='0.3.0';
let name='',lat='',lon='';
AppSettingsPage({
 build(props){
  const store=props.settingsStorage;
  const defaultCity={name:'Antwerpen',lat:51.2194,lon:4.4025};
  let active=defaultCity;
  try{
   const selected=store.getItem('buienradar.location');
   if(selected)active=JSON.parse(selected);
  }catch(_){}
  const ink='#12303b',muted='#627985',line='#e0edf2';
  const button={padding:'12px 16px',borderRadius:'13px',background:'#153b4c',
   color:'#ffffff',fontWeight:'600'};
  const field={padding:'11px',background:'#edf4f7',borderRadius:'11px',
   border:'1px solid '+line};
  const blocks=[];
  const add=x=>blocks.push(View({style:{display:'block',width:'100%',
   marginBottom:'12px',clear:'both'}},[x]));
  add(Text({bold:true,style:{fontSize:'28px',color:ink}},'BUIENRADAR'));
  add(Text({paragraph:true,style:{color:muted,fontSize:'13px',lineHeight:'1.5'}},
   'Drie veegschermen: bewegende officiële Buienradar-kaart, grote regengrafiek en weergegevens. Kies hieronder je locatie; de radar heeft geen GPS- of vernieuwknoppen.'));
  add(Text({bold:true,style:{fontSize:'17px',color:ink}},'Locatie: '+active.name));
  for(const city of CITIES){
   const selected=active.name===city[0];
   add(Button({label:(selected?'✓ ':'')+city[0],style:{...button,
    background:selected?'#087eaf':'#e5f0f4',color:selected?'#fff':ink},
    onClick:()=>store.setItem('buienradar.location',
     JSON.stringify({name:city[0],lat:city[1],lon:city[2]}))}));
  }
  add(Text({bold:true,style:{fontSize:'17px',color:ink}},'Eigen coördinaten'));
  add(TextInput({label:'Plaatsnaam',value:name,placeholder:'Bijv. Aalst',
   subStyle:field,onChange:v=>{name=String(v||'').slice(0,28);}}));
  add(TextInput({label:'Breedtegraad',value:lat,placeholder:'50.94',
   subStyle:field,onChange:v=>{lat=String(v||'').trim();}}));
  add(TextInput({label:'Lengtegraad',value:lon,placeholder:'4.04',
   subStyle:field,onChange:v=>{lon=String(v||'').trim();}}));
  add(Button({label:'Bewaar locatie',style:button,onClick:()=>{
   const x=Number(lat.replace(',','.')),y=Number(lon.replace(',','.'));
   if(!name.trim()||!Number.isFinite(x)||!Number.isFinite(y)||
     x<49||x>54||y<2||y>8){
    store.setItem('buienradar.settings.status','Vul een plaats en geldige Benelux-coördinaten in');
    return;
   }
   store.setItem('buienradar.location',JSON.stringify({name:name.trim(),lat:x,lon:y}));
   store.setItem('buienradar.settings.status','Locatie opgeslagen');
  }}));
  const status=store.getItem('buienradar.settings.status');
  if(status)add(Text({paragraph:true,style:{color:muted,fontSize:'14px'}},status));
  add(Text({paragraph:true,style:{color:muted,fontSize:'13px'}},
   'Buienradar voor Balance 2 · v'+VERSION+' · Onafhankelijke testapp'));
  add(Text({paragraph:true,style:{color:muted,fontSize:'13px'}},
   'Nieuwe versies krijgen automatisch een installatie-QR, maar niet automatisch een stille installatie. Swipe LINKS vanaf de wijzerplaat. Voeg Buienradar toe via Instellingen - Voorkeuren - Widgets.'));
  add(Link({source:'https://github.com/Jorn1993/amazfit-apps/tree/main/apps/buienradar/public/'},
   [Text({},'Update en installatie-QR')]));
  add(Text({paragraph:true,style:{color:muted,fontSize:'12px'}},
   'Bron: Buienradar.nl. Gebruik in mobiele apps vereist toestemming van Buienradar.'));
  return View({style:{padding:'24px',background:'#ffffff',display:'flex',
   flexDirection:'column',alignItems:'stretch'}},blocks);
 }
});
