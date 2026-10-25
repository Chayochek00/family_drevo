export type FamilyTree = {
  id: string;
  name: string;
  created_at: string;
};

export type Person = {
  id: string;
  tree_id: string;
  first_name: string;
  last_name: string | null;
  patronymic: string | null;
  birth_date: string | null;
  death_date: string | null;
  birth_place: string | null;
  photo_path: string | null;
  biography: string | null;
  gender: 'male' | 'female' | 'other' | 'unspecified';
  created_at: string;
};

export type RelationshipType = 'parent' | 'sibling' | 'spouse' | 'uncle_aunt' | 'niece_nephew';

export type Relationship = {
  id: string;
  tree_id: string;
  from_person_id: string;
  to_person_id: string;
  type: RelationshipType;
  source_handle?: 'source-top' | 'source-bottom' | null;
  target_handle?: 'target-top' | 'target-bottom' | null;
};
