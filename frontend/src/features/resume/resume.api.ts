import { apiClient } from '@/services/api.client';
import type { UploadFile } from 'antd';

export interface Resume {
  id: string;
  ownerId: string;
  fileName: string;
  uploadedAt: string;
  /** The API may return the persisted `createdAt` name for legacy records. */
  createdAt?: string;
  analysisStatus: 'pending' | 'analyzing' | 'completed' | 'failed';
  profile?: ResumeProfile;
  rawText?: string;
}

export interface ResumeProfile {
  name: string;
  email?: string;
  phone?: string;
  targetRole: string;
  skills: string[];
  experience: Experience[];
  education: Education[];
  strengths: string[];
  risks: string[];
  recommendedRoles: RecommendedRole[];
}

export interface Experience {
  company: string;
  role: string;
  duration: string;
  description: string;
  achievements?: string[];
}

export interface Education {
  school: string;
  degree: string;
  major: string;
  year: string;
}

export interface RecommendedRole {
  role: string;
  confidence: number;
  reason: string;
}

export interface ResumeAnalysis {
  mode: 'model' | 'fallback' | 'mixed';
  profile: ResumeProfile;
  analysisVersion?: string;
}

/** Normalize legacy analyzer output to the shape consumed by the React views. */
function normalizeProfile(raw: any): ResumeProfile | undefined {
  if (!raw) return undefined;
  return {
    ...raw,
    name: raw.name || raw.contact?.name || '',
    email: raw.email || raw.contact?.email,
    phone: raw.phone || raw.contact?.phone,
    targetRole: raw.targetRole || '',
    skills: Array.isArray(raw.skills) ? raw.skills : [],
    experience: Array.isArray(raw.experience) ? raw.experience : (Array.isArray(raw.experiences) ? raw.experiences : []),
    education: Array.isArray(raw.education) ? raw.education : [],
    strengths: Array.isArray(raw.strengths) ? raw.strengths : [],
    risks: Array.isArray(raw.risks) ? raw.risks : [],
    recommendedRoles: Array.isArray(raw.recommendedRoles) ? raw.recommendedRoles : [],
  };
}

function normalizeResume(raw: any): Resume {
  return {
    ...raw,
    uploadedAt: raw.uploadedAt || raw.createdAt || '',
    analysisStatus: raw.analysisStatus || 'completed',
    profile: normalizeProfile(raw.profile),
  };
}

// 上传简历
export const resumeApi = {
  upload: async (file: File | UploadFile): Promise<Resume> => {
    const formData = new FormData();
    if (file instanceof File) {
      formData.append('resume', file);
    } else {
      formData.append('resume', file.originFileObj as File);
    }

    const response = await apiClient.post('/resumes', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  list: async (): Promise<{ resumes: Resume[] }> => {
    const response = await apiClient.get('/resumes');
    const payload = response.data as { resumes?: Array<Resume & { createdAt?: string; analysisStatus?: Resume['analysisStatus'] }> };
    return {
      resumes: (payload.resumes || []).map(normalizeResume),
    };
  },

  get: async (id: string): Promise<Resume> => {
    const response = await apiClient.get(`/resumes/${id}`);
    return normalizeResume(response.data);
  },

  getAnalysis: async (id: string): Promise<ResumeAnalysis> => {
    const response = await apiClient.get(`/resumes/${id}/analysis`);
    return response.data;
  },

  analyze: async (id: string): Promise<ResumeAnalysis> => {
    const response = await apiClient.post(`/resumes/${id}/analyze`);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/resumes/${id}`);
  },
};
