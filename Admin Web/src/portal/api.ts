const BASE=(import.meta.env.VITE_API_URL as string|undefined)?.replace(/\/$/,'')??(import.meta.env.PROD?'/api':'http://localhost:4000/v1');
async function api<T>(path:string,options:RequestInit={}):Promise<T>{const method=(options.method??'GET').toUpperCase();const headers=new Headers(options.headers);headers.set('Content-Type','application/json');if(!['GET','HEAD','OPTIONS'].includes(method))headers.set('X-XTRIM-Request','1');const response=await fetch(`${BASE}${path}`,{...options,credentials:'include',headers});if(response.status===401&&!window.location.pathname.startsWith('/login')){window.location.replace('/login');throw new Error('Your session expired. Please sign in again.')}if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.message||`Request failed (${response.status})`)}if(response.status===204)return undefined as T;return response.json() as Promise<T>}
export type MemberUser={id:string;role:'MEMBER'|'COACH';memberNumber?:string;coachNumber?:string;firstName:string;lastName:string;mustChangePassword:boolean};
export type Overview={membership:{plan:string;status:string;startedAt:string;expiresAt:string}|null;card:{status:string}|null;gym:{isOpen:boolean;statusLabel:string;hoursToday:string};attendanceSummary:{totalVisits:number;visitsThisMonth:number;lastVisitAt?:string};announcements:Array<{id:string;title:string;message:string;publishedAt:string}>};
export type CoachOverview={coach:{coachNumber:string;fullName:string;specialty:string;availability:string};gym:{hoursToday:string};attendance:Array<{id:string;attendanceDate:string;checkedInAt:string;checkedOutAt?:string}>};
export const memberApi={
 me:()=>api<MemberUser>('/auth/me'),
 logout:()=>api<void>('/auth/logout',{method:'POST'}),
 changeTemporaryPassword:(currentPassword:string,newPassword:string)=>api<void>('/auth/first-password',{method:'POST',body:JSON.stringify({currentPassword,newPassword})}),
 overview:()=>api<Overview>('/member/overview'),
 attendance:()=>api<{items:Array<{id:string;recordedAt:string;checkedOutAt?:string;status:string;station:string}>}>('/member/attendance'),
 coaches:()=>api<{items:Array<{id:string;fullName:string;specialty:string;availability:string}>}>('/member/coaches'),
  updatePassword:(currentPassword:string,newPassword:string)=>api<void>('/auth/password',{method:'PUT',body:JSON.stringify({currentPassword,newPassword})}),
  coachOverview:()=>api<CoachOverview>('/coach/overview'),
};
