import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, Text, View, StyleSheet, TextInput, Pressable, ScrollView } from 'react-native';
import { createLobbyRuntime, type LobbyViewState, type HandTile, type Meld } from './lobby-runtime';

type Lang = 'en' | 'zh';
const I18N: Record<Lang, Record<string, string>> = {
  en: { randomName:'Random', hello:'Hello',create:'Create',join:'Join',addBot:'Add Bot',ready:'Ready',rematch:'Rematch',scoreboard:'Scoreboard',melds:'Melds',status:'Status',phase:'Phase',table:'Table',submitExchange:'Submit Exchange',lackWan:'Lack Wan',lackTiao:'Lack Tiao',lackTong:'Lack Tong',reactHu:'Hu',reactGang:'Gang',reactPeng:'Peng',reactPass:'Pass',selfHu:'Self Hu' },
  zh: { randomName:'随机昵称', hello:'确认昵称',create:'创建房间',join:'加入房间',addBot:'添加机器人',ready:'准备',rematch:'再来一局',scoreboard:'记分板',melds:'碰/杠',status:'状态',phase:'阶段',table:'牌桌',submitExchange:'提交换三张',lackWan:'定缺万',lackTiao:'定缺条',lackTong:'定缺筒',reactHu:'胡',reactGang:'杠',reactPeng:'碰',reactPass:'过',selfHu:'自摸胡' }
};
const t=(l:Lang,k:string)=>I18N[l][k]||k;

export default function App(): JSX.Element {
  const [lang,setLang]=useState<Lang>('zh');
  const [mode,setMode]=useState<'preview'|'live'>('live');
  const [wsUrl,setWsUrl]=useState('ws://127.0.0.1:8787');
  const [busy,setBusy]=useState(false);
  const [exchangeSelected,setExchangeSelected]=useState<string[]>([]);
  const [state,setState]=useState<LobbyViewState>({name:'',roomId:'',players:[],connected:false,statusKey:'idle',yourHandTiles:[],discards:[],yourMelds:[],canSelfHu:false,pendingReaction:null,rematchReadySeats:[],matchFinished:false});

  const runtime=useMemo(()=>createLobbyRuntime({mode,wsUrl,onState:(patch)=>setState((s)=>({...s,...patch}))}),[mode,wsUrl]);
  useEffect(()=>{runtime.connect(); return ()=>runtime.disconnect();},[runtime]);
  useEffect(()=>{if(state.gamePhase!=='exchange') setExchangeSelected([]);},[state.gamePhase]);

  const canDiscard=state.gamePhase==='play'&&state.turnSeat===state.yourSeat;
  const inExchange=state.gamePhase==='exchange';
  const inLack=state.gamePhase==='lack';
  const inSettlement=state.gamePhase==='settlement';
  const mySeat=state.yourSeat;

  const anGang=findAnGangCandidates(state.yourHandTiles);
  const buGang=findBuGangCandidates(state.yourHandTiles,state.yourMelds);
  const leaderboard=[...state.players].sort((a,b)=>b.totalScore-a.totalScore||a.seat-b.seat);

  const run=(fn:()=>boolean)=>{ if(busy) return; setBusy(true); try{fn();}finally{setTimeout(()=>setBusy(false),120);} };
  const genRandomName=()=>{const p=['雀友','牌侠','听牌王','川麻客','杠上花'];const q=['东风','南风','西风','北风','红中','发财','白板'];const a=p[Math.floor(Math.random()*p.length)];const b=q[Math.floor(Math.random()*q.length)];return `${a}${b}${Math.floor(1000+Math.random()*9000)}`;};
  const onTilePress=(tile:HandTile)=>{ if(inExchange){setExchangeSelected(p=>p.includes(tile.id)?p.filter(x=>x!==tile.id):(p.length>=3?p:[...p,tile.id]));return;} if(canDiscard) run(()=>runtime.discard(tile.id)); };

  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.wrap}><View style={styles.card}>
    <View style={styles.row}><Btn text='中文' onPress={()=>setLang('zh')} /><Btn text='EN' onPress={()=>setLang('en')} /><Btn text='Preview' onPress={()=>setMode('preview')} /><Btn text='Live' onPress={()=>setMode('live')} /></View>
    <TextInput style={styles.input} value={wsUrl} onChangeText={setWsUrl} />
    <TextInput style={styles.input} value={state.name} onChangeText={(name)=>setState(s=>({...s,name}))} placeholder='Name'/>
    <TextInput style={styles.input} value={state.roomId} onChangeText={(roomId)=>setState(s=>({...s,roomId:roomId.toUpperCase()}))} placeholder='Room' />
    <View style={styles.row}><Btn text={t(lang,'hello')} onPress={()=>run(()=>runtime.hello(state.name))}/><Btn text={t(lang,'create')} onPress={()=>run(()=>runtime.createRoom())}/><Btn text={t(lang,'join')} onPress={()=>run(()=>runtime.joinRoom(state.roomId))}/><Btn text={t(lang,'addBot')} onPress={()=>run(()=>runtime.addBot())}/><Btn text={t(lang,'ready')} onPress={()=>run(()=>runtime.setReady())}/></View>

    {state.pendingReaction?<View style={styles.row}>{state.pendingReaction.canHu&&<Btn text={t(lang,'reactHu')} onPress={()=>run(()=>runtime.react('hu'))}/>}{state.pendingReaction.canGang&&<Btn text={t(lang,'reactGang')} onPress={()=>run(()=>runtime.react('gang'))}/>}{state.pendingReaction.canPeng&&<Btn text={t(lang,'reactPeng')} onPress={()=>run(()=>runtime.react('peng'))}/>}<Btn text={t(lang,'reactPass')} onPress={()=>run(()=>runtime.react('pass'))}/></View>:null}
    {!state.pendingReaction&&canDiscard&&state.canSelfHu?<View style={styles.row}><Btn text={t(lang,'selfHu')} onPress={()=>run(()=>runtime.selfHu())}/></View>:null}
    {!state.pendingReaction&&canDiscard&&anGang.map(x=><View key={x.id} style={styles.row}><Btn text={`暗杠 ${x.code}`} onPress={()=>run(()=>runtime.anGang(x.id))}/></View>)}
    {!state.pendingReaction&&canDiscard&&buGang.map(x=><View key={x.id} style={styles.row}><Btn text={`补杠 ${x.code}`} onPress={()=>run(()=>runtime.buGang(x.id))}/></View>)}

    {inExchange?<View style={styles.row}><Text style={styles.meta}>换三张 {exchangeSelected.length}/3</Text><Btn text={t(lang,'submitExchange')} onPress={()=>run(()=>runtime.submitExchange(exchangeSelected))}/></View>:null}
    {inLack?<View style={styles.row}><Btn text={t(lang,'lackWan')} onPress={()=>run(()=>runtime.setLack('wan'))}/><Btn text={t(lang,'lackTiao')} onPress={()=>run(()=>runtime.setLack('tiao'))}/><Btn text={t(lang,'lackTong')} onPress={()=>run(()=>runtime.setLack('tong'))}/></View>:null}
    {inSettlement?<View style={styles.row}><Btn text={t(lang,'rematch')} onPress={()=>run(()=>runtime.requestRematch())}/></View>:null}

    <Text style={styles.meta}>{t(lang,'status')}: {state.statusKey} {state.statusArgs?.detail?`(${state.statusArgs.detail})`:''}</Text>
    <Text style={styles.meta}>{t(lang,'phase')}: {state.gamePhase || '-'}</Text>

    <View style={styles.panel}><Text style={styles.title}>{t(lang,'scoreboard')}</Text>{leaderboard.map((p,i)=><Text key={p.seat} style={styles.meta}>{i+1}. S{p.seat} {p.name} {p.totalScore} {state.rematchReadySeats.includes(p.seat)?'✅':''}</Text>)}</View>
    <View style={styles.panel}><Text style={styles.title}>{t(lang,'melds')}</Text>{state.players.length===0?<Text style={styles.meta}>-</Text>:state.players.map((p)=><Text key={p.seat} style={styles.meta}>S{p.seat} {p.name}: {renderMelds(p.melds)}</Text>)}</View>

    <View style={styles.panel}><Text style={styles.title}>{t(lang,'table')}</Text><View style={styles.tileRow}>{state.yourHandTiles.map((tile)=> <Tile key={tile.id} code={tile.code} selected={exchangeSelected.includes(tile.id)} onPress={()=>onTilePress(tile)} />)}</View><View style={styles.tileRow}>{state.discards.map((d,i)=><Tile key={`${d.tileCode}-${i}`} code={`${d.tileCode}@${d.seat}`} small/>)}</View></View>
  </View></ScrollView></SafeAreaView>;
}

function renderMelds(melds:Meld[]){ if(!melds||melds.length===0) return '-'; return melds.map((m)=>`${m.type}:${suitPrefix(m.tile.suit)}${m.tile.rank}`).join('、'); }
function findAnGangCandidates(hand: HandTile[]){const m=new Map<string,HandTile[]>();for(const t of hand){const k=`${t.suit}-${t.rank}`;m.set(k,[...(m.get(k)||[]),t]);}return [...m.values()].filter(v=>v.length>=4).map(v=>v[0]);}
function findBuGangCandidates(hand: HandTile[],melds:Meld[]){const keys=new Set((melds||[]).filter(m=>m.type==='peng').map(m=>`${m.tile.suit}-${m.tile.rank}`));return hand.filter(t=>keys.has(`${t.suit}-${t.rank}`));}
function suitPrefix(suit:string){if(suit==='wan')return'w';if(suit==='tong')return'b';return't';}

function Btn({text,onPress}:{text:string;onPress:()=>void}){return <Pressable style={styles.btn} onPress={onPress}><Text style={styles.btnText}>{text}</Text></Pressable>;}
function Tile({code,small=false,selected=false,onPress}:{code:string;small?:boolean;selected?:boolean;onPress?:()=>void}){const pure=code.includes('@')?code.split('@')[0]:code;const suit=pure[0];const rank=Number(pure.slice(1));const {label,color}=meta(suit);return <Pressable onPress={onPress} disabled={!onPress} style={[styles.tile,small&&styles.tileSmall,selected&&styles.tileSel]}><Text style={[styles.corner,{color}]}>{label}</Text><Text style={[styles.rank,{color}]}>{rank}</Text><Text style={[styles.corner,{color,alignSelf:'flex-end'}]}>{label}</Text></Pressable>;}
function meta(s:string){if(s==='w')return{label:'萬',color:'#dc2626'};if(s==='t')return{label:'条',color:'#16a34a'};return{label:'筒',color:'#2563eb'};}

const styles=StyleSheet.create({page:{flex:1,backgroundColor:'#0f172a'},wrap:{padding:16,alignItems:'center'},card:{width:780,backgroundColor:'#111827',borderRadius:14,padding:14},row:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:8},input:{borderWidth:1,borderColor:'#334155',borderRadius:8,color:'#e2e8f0',padding:10,marginTop:8},btn:{backgroundColor:'#1d4ed8',paddingHorizontal:10,paddingVertical:7,borderRadius:8},btnText:{color:'#fff',fontWeight:'600'},meta:{color:'#cbd5e1',marginTop:4},panel:{marginTop:10,borderWidth:1,borderColor:'#334155',borderRadius:10,padding:8,backgroundColor:'#0b1220'},title:{color:'#f8fafc',fontWeight:'700'},tileRow:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:6},tile:{width:38,height:58,borderWidth:1,borderColor:'#d1d5db',borderRadius:8,backgroundColor:'#fff',padding:4,justifyContent:'space-between'},tileSmall:{width:34,height:50},tileSel:{borderColor:'#f59e0b',transform:[{translateY:-2}]},corner:{fontSize:10,fontWeight:'700'},rank:{fontSize:20,fontWeight:'800',textAlign:'center'}});
