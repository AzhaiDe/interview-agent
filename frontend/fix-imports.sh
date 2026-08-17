#!/bin/bash

# Fix unused imports in Loading.tsx
sed -i "s/  variant = 'spinner',//g" src/components/ui/Loading.tsx

# Fix unused import in recruiter.api.ts
sed -i "s/import type { Resume, ResumeProfile } from/import type { ResumeProfile } from/g" src/features/recruiter/recruiter.api.ts

# Fix unused import in resume.hooks.ts
sed -i "s/import { useMutation, useQuery, useQueryClient } from '@tanstack\/react-query';import type { Resume } from '.\/resume.api';/import { useMutation, useQuery, useQueryClient } from '@tanstack\/react-query';/g" src/features/resume/resume.hooks.ts

# Fix unused imports in InterviewChatPage.tsx
sed -i "/import {/s/CloseCircleOutlined, //g" src/pages/Interview/InterviewChatPage.tsx

# Fix unused imports in InterviewReportPage.tsx
sed -i "/import {/s/Divider, //g" src/pages/Interview/InterviewReportPage.tsx
sed -i "/import {/s/Paragraph, //g" src/pages/Interview/InterviewReportPage.tsx
sed -i "11a import { Button } from '@/components/ui';" src/pages/Interview/InterviewReportPage.tsx

# Fix unused imports in RecruiterJobDetailPage.tsx
sed -i "/import {/s/CheckCircleOutlined, //g" src/pages/Recruiter/RecruiterJobDetailPage.tsx
sed -i "/import {/s/ClockCircleOutlined, //g" src/pages/Recruiter/RecruiterJobDetailPage.tsx
sed -i "/import {/s/CloseCircleOutlined, //g" src/pages/Recruiter/RecruiterJobDetailPage.tsx

# Fix unused imports in RecruiterJobsPage.tsx
sed -i "/import {/s/DeleteOutlined, //g" src/pages/Recruiter/RecruiterJobsPage.tsx
sed -i "/import {/s/ClockCircleOutlined, //g" src/pages/Recruiter/RecruiterJobsPage.tsx
sed -i "/import {/s/Paragraph, //g" src/pages/Recruiter/RecruiterJobsPage.tsx

# Fix unused import in ResumeDetailPage.tsx
sed -i "s/import type { Resume } from '.\/resume.api';//g" src/pages/Resume/ResumeDetailPage.tsx

# Fix unused import in ResumeListPage.tsx
sed -i "/import {/s/Paragraph, //g" src/pages/Resume/ResumeListPage.tsx

echo "Fixed all unused imports"
