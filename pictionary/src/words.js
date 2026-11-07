/* ===== word packs: suggestions for the team setting a word (they can always type their own) ===== */
const PC_WORDS = (function () {
  const P = {
    everyday: {
      Object: 'umbrella,toothbrush,scissors,ladder,backpack,candle,mirror,pillow,bucket,clock,key,lamp,spoon,kite,balloon,camera,glasses,helmet,remote,wallet,necklace,hammer,broom,bottle,chair,bicycle,guitar,headphones,laptop,trophy,telescope,anchor,parachute,magnet,envelope,calculator,toaster,lock,sock,crown',
      Animal: 'elephant,giraffe,penguin,octopus,snail,kangaroo,peacock,crocodile,butterfly,camel,dolphin,owl,spider,turtle,rabbit,shark,monkey,zebra,bat,frog,parrot,squirrel,lion,snake,jellyfish,cow,goat,mosquito,crab,horse',
      Action: 'sleeping,swimming,dancing,sneezing,juggling,fishing,climbing,cooking,crying,laughing,running,singing,yawning,brushing teeth,skipping rope,flying a kite,taking a selfie,clapping,whistling,surfing',
      Place: 'beach,hospital,airport,library,volcano,island,castle,desert,school,zoo,bridge,lighthouse,cinema,supermarket,igloo,pyramid,waterfall,gym,park,railway station',
      Food: 'pizza,burger,ice cream,banana,watermelon,popcorn,sandwich,cake,egg,noodles,carrot,cheese,donut,grapes,pineapple,lollipop,coconut,cookie,corn,chocolate',
      Sport: 'football,tennis,basketball,badminton,boxing,golf,skating,archery,bowling,cycling',
      Person: 'doctor,pilot,teacher,astronaut,firefighter,chef,magician,police officer,farmer,pirate,king,clown,artist,photographer,dentist'
    },
    india: {
      Food: 'samosa,biryani,dosa,idli,vada pav,pani puri,jalebi,chai,gulab jamun,pav bhaji,paratha,rasgulla,ladoo,butter chicken,dal makhani,chole bhature,kulfi,lassi,momos,poha,upma,dhokla,naan,pakora,mango',
      Movie: 'sholay,dangal,lagaan,3 idiots,dilwale dulhania le jayenge,kabhi khushi kabhie gham,gully boy,baahubali,rrr,pushpa,jawan,pathaan,taare zameen par,pk,munna bhai mbbs,hera pheri,andaz apna apna,zindagi na milegi dobara,queen,chak de india,dhoom,krrish,don,golmaal,stree',
      Festival: 'diwali,holi,raksha bandhan,ganesh chaturthi,navratri,eid,christmas,onam,pongal,durga puja,lohri,janmashtami,dussehra,makar sankranti,baisakhi',
      Sport: 'cricket,kabaddi,kho kho,carrom,gilli danda,chess,ludo,hockey,wrestling,sixer,wicket keeper,run out,hat trick,free hit,ipl',
      Object: 'rickshaw,auto rickshaw,pressure cooker,tiffin box,rangoli,diya,kite festival,saree,kurta,turban,bindi,mehendi,tabla,sitar,harmonium,dholak,charpai,matka,bangles,jhumka',
      Place: 'taj mahal,india gate,gateway of india,red fort,qutub minar,golden temple,mumbai local,goa beach,himalayas,kerala backwaters,ganga ghat,metro station,chai tapri,dhaba,mall',
      Person: 'auto driver,chaiwala,dabbawala,pandit,traffic police,cricket umpire,shopkeeper,watchman,tailor,barber'
    },
    hard: {
      Phrase: 'piece of cake,break a leg,raining cats and dogs,once in a blue moon,spill the beans,cold feet,hit the sack,under the weather,on cloud nine,elephant in the room,time flies,butterflies in my stomach,couch potato,early bird,the last straw,a hot potato,heart of gold,low battery,traffic jam,monday morning',
      Idea: 'gravity,freedom,jealousy,nostalgia,deadline,friendship,déjà vu,gossip,karma,luck,dream,secret,silence,echo,shadow,balance,hangover,homesick,procrastination,inflation',
      Thing: 'wifi,password,black hole,time machine,solar eclipse,rainbow,earthquake,tornado,traffic light,voting,wedding,birthday party,job interview,exam result,power cut,online class,group selfie,mid life crisis,first date,stand up comedy'
    }
  };
  const all = [];
  Object.keys(P).forEach(function (pack) {
    Object.keys(P[pack]).forEach(function (cat) {
      P[pack][cat].split(',').forEach(function (w) { w = w.trim(); if (w) all.push({ word: w, category: cat, pack: pack }); });
    });
  });
  return { packs: P, all: all };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = PC_WORDS;
