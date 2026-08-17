import { apiClient } from '@/services/api.client';
import type { UploadFile } from 'antd';

export interface Resume {
  id: string;
  ownerId: string;
  fileName: string;
  uploadedAt: string;
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
    return response.data;
  },

  get: async (id: string): Promise<Resume> => {
    const response = await apiClient.get(`/resumes/${id}`);
    return response.data;
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
