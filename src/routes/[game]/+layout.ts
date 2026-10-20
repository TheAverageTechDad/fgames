import { error } from '@sveltejs/kit';
import { difficulties } from '#lib/level-library';
export async function load({params,fetch}) {
 if(params.game!=='nuts' && params.game!=='escape') error(404,'Game not found');
 const entries=await Promise.all(difficulties.map(async d=>{
  const response=await fetch(`/levels/${params.game}/${d}.json`);
  if(!response.ok) error(503,'Could not load this game. Reconnect once and try again.');
  return [d,await response.json()];
 }));
 return {game:params.game,library:Object.fromEntries(entries)};
}
