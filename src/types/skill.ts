export type SkillSource = 'user' | 'project';

export interface Skill {
  name: string;
  description?: string;
  version?: string;
  triggers: string[];
  roles: string[];
  author?: string;
  tags: string[];
  body: string;
  source: SkillSource;
}
