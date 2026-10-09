const BASE=(import.meta.env.VITE_API_URL as string|undefined)?.replace(/\/$/,'')??'http://localhost:4000/v1';
async function api<T>(path:string,options:RequestInit={}):Promise<T>{const response=await fetch(`${BASE}${path}`,{...options,credentials:'include',headers:{'Content-Type':'application/json',...options.headers}});if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.message||`Request failed (${response.status})`)}if(response.status===204)return undefined as T;return response.json() as Promise<T>}
export type MemberUser={id:string;memberNumber:string;firstName:string;lastName:string;mustChangePassword:boolean};
export type Overview={membership:{plan:string;status:string;startedAt:string;expiresAt:string}|null;card:{status:string}|null;gym:{isOpen:boolean;statusLabel:string;hoursToday:string};attendanceSummary:{totalVisits:number;visitsThisMonth:number;lastVisitAt?:string};announcements:Array<{id:string;title:string;message:string;publishedAt:string}>};
export const memberApi={
 me:()=>api<MemberUser>('/auth/me'),
 login:(username:string,password:string,cardToken?:string)=>api<MemberUser>('/auth/login',{method:'POST',body:JSON.stringify({username,password,portal:'member',cardToken})}),
 logout:()=>api<void>('/auth/logout',{method:'POST'}),
 changeTemporaryPassword:(currentPassword:string,newPassword:string)=>api<void>('/auth/first-password',{method:'POST',body:JSON.stringify({currentPassword,newPassword})}),
 resolveCard:(token:string)=>api<{recognized:boolean;memberHint?:string}>(`/member/card/${encodeURIComponent(token)}`),
 overview:()=>api<Overview>('/member/overview'),
 attendance:()=>api<{items:Array<{id:string;recordedAt:string;status:string;station:string}>}>('/member/attendance'),
 coaches:()=>api<{items:Array<{id:string;fullName:string;specialty:string;availability:string}>}>('/member/coaches'),
 updatePassword:(currentPassword:string,newPassword:string)=>api<void>('/member/password',{method:'PUT',body:JSON.stringify({currentPassword,newPassword})}),
};
