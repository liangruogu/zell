package repository

import (
	"testing"
)

func TestEnsureProject(t *testing.T) {
	db := setupTestDB(t)

	err := db.EnsureProject("p1")
	if err != nil {
		t.Fatalf("EnsureProject failed: %v", err)
	}

	err = db.EnsureProject("p1")
	if err != nil {
		t.Fatalf("EnsureProject idempotent failed: %v", err)
	}
}

func TestSetCollabEnabled(t *testing.T) {
	db := setupTestDB(t)

	err := db.SetCollabEnabled("p1", true, "token1", "My Project")
	if err != nil {
		t.Fatalf("SetCollabEnabled failed: %v", err)
	}

	proj, err := db.GetProject("p1")
	if err != nil {
		t.Fatalf("GetProject failed: %v", err)
	}
	if !proj.CollabEnabled {
		t.Error("expected collab_enabled to be true")
	}
	if proj.Name != "My Project" {
		t.Errorf("expected name 'My Project', got '%s'", proj.Name)
	}
	if proj.OwnerToken != "token1" {
		t.Errorf("expected owner_token 'token1', got '%s'", proj.OwnerToken)
	}
	if proj.InviteCode == "" {
		t.Error("expected invite_code to be set when collab enabled")
	}
}

func TestSetCollabDisabled(t *testing.T) {
	db := setupTestDB(t)

	db.SetCollabEnabled("p1", true, "token1", "Test")
	err := db.SetCollabEnabled("p1", false, "", "")
	if err != nil {
		t.Fatalf("SetCollabEnabled(false) failed: %v", err)
	}

	proj, _ := db.GetProject("p1")
	if proj.CollabEnabled {
		t.Error("expected collab_enabled to be false")
	}
	if proj.InviteCode != "" {
		t.Error("expected invite_code to be empty when disabled")
	}
}

func TestGetProjectDefault(t *testing.T) {
	db := setupTestDB(t)

	proj, err := db.GetProject("new-project")
	if err != nil {
		t.Fatalf("GetProject failed: %v", err)
	}
	if proj.CollabEnabled {
		t.Error("expected new project to have collab disabled")
	}
	if proj.Status != "active" {
		t.Errorf("expected status 'active', got '%s'", proj.Status)
	}
}

func TestUpdateProjectInfo(t *testing.T) {
	db := setupTestDB(t)

	db.EnsureProject("p1")
	err := db.UpdateProjectInfo("p1", "Updated Name", "Updated Desc", `{"theme":"dark"}`)
	if err != nil {
		t.Fatalf("UpdateProjectInfo failed: %v", err)
	}

	proj, _ := db.GetProject("p1")
	if proj.Name != "Updated Name" {
		t.Errorf("expected name 'Updated Name', got '%s'", proj.Name)
	}
	if proj.Description != "Updated Desc" {
		t.Errorf("expected description 'Updated Desc', got '%s'", proj.Description)
	}
	if proj.Config != `{"theme":"dark"}` {
		t.Errorf("expected config '{\"theme\":\"dark\"}', got '%s'", proj.Config)
	}
}

func TestSetCollabDeleted(t *testing.T) {
	db := setupTestDB(t)

	db.SetCollabEnabled("p1", true, "token1", "Test")
	err := db.SetCollabDeleted("p1")
	if err != nil {
		t.Fatalf("SetCollabDeleted failed: %v", err)
	}

	proj, _ := db.GetProject("p1")
	if proj.CollabEnabled {
		t.Error("expected collab to be disabled after deletion")
	}
	if proj.InviteCode != "" {
		t.Error("expected invite_code to be empty after deletion")
	}
	if proj.Status != "deleted" {
		t.Errorf("expected status 'deleted', got '%s'", proj.Status)
	}
}

func TestRotateInviteCode(t *testing.T) {
	db := setupTestDB(t)

	db.SetCollabEnabled("p1", true, "token1", "Test")
	proj, _ := db.GetProject("p1")
	oldCode := proj.InviteCode

	newCode, err := db.RotateInviteCode("p1")
	if err != nil {
		t.Fatalf("RotateInviteCode failed: %v", err)
	}
	if newCode == "" {
		t.Error("expected new invite code")
	}
	if newCode == oldCode {
		t.Error("expected invite code to change after rotation")
	}
}

func TestRotateInviteCodeDisabled(t *testing.T) {
	db := setupTestDB(t)

	db.EnsureProject("p1")
	_, err := db.RotateInviteCode("p1")
	if err != nil {
		t.Fatalf("RotateInviteCode should not error on disabled project: %v", err)
	}

	proj, _ := db.GetProject("p1")
	if proj.InviteCode != "" {
		t.Errorf("expected invite_code to remain empty when collab is disabled, got '%s'", proj.InviteCode)
	}
}

func TestValidateInviteCode(t *testing.T) {
	db := setupTestDB(t)

	db.SetCollabEnabled("p1", true, "token1", "Test")
	proj, _ := db.GetProject("p1")

	projectID, err := db.ValidateInviteCode(proj.InviteCode)
	if err != nil {
		t.Fatalf("ValidateInviteCode failed: %v", err)
	}
	if projectID != "p1" {
		t.Errorf("expected projectID 'p1', got '%s'", projectID)
	}
}

func TestValidateInviteCodeInvalid(t *testing.T) {
	db := setupTestDB(t)

	_, err := db.ValidateInviteCode("INVALID-CODE")
	if err == nil {
		t.Error("expected error for invalid invite code")
	}
}

func TestValidateInviteCodeDeleted(t *testing.T) {
	db := setupTestDB(t)

	db.SetCollabEnabled("p1", true, "token1", "Test")
	proj, _ := db.GetProject("p1")
	db.SetCollabDeleted("p1")

	_, err := db.ValidateInviteCode(proj.InviteCode)
	if err == nil {
		t.Error("expected error for deleted project's invite code")
	}
}

func TestAddMember(t *testing.T) {
	db := setupTestDB(t)

	err := db.AddMember("p1", "client1", "Alice")
	if err != nil {
		t.Fatalf("AddMember failed: %v", err)
	}

	isMember, err := db.IsMember("p1", "client1")
	if err != nil {
		t.Fatalf("IsMember failed: %v", err)
	}
	if !isMember {
		t.Error("expected client1 to be a member")
	}
}

func TestIsMemberFalse(t *testing.T) {
	db := setupTestDB(t)

	isMember, err := db.IsMember("p1", "nonexistent")
	if err != nil {
		t.Fatalf("IsMember failed: %v", err)
	}
	if isMember {
		t.Error("expected false for nonexistent member")
	}
}

func TestRemoveMember(t *testing.T) {
	db := setupTestDB(t)

	db.AddMember("p1", "client1", "Alice")
	err := db.RemoveMember("p1", "client1")
	if err != nil {
		t.Fatalf("RemoveMember failed: %v", err)
	}

	isMember, _ := db.IsMember("p1", "client1")
	if isMember {
		t.Error("expected client1 to not be a member after removal")
	}
}

func TestGetMemberStatus(t *testing.T) {
	db := setupTestDB(t)

	db.AddMember("p1", "client1", "Alice")
	status, err := db.GetMemberStatus("p1", "client1")
	if err != nil {
		t.Fatalf("GetMemberStatus failed: %v", err)
	}
	if status != "active" {
		t.Errorf("expected status 'active', got '%s'", status)
	}
}

func TestGetMemberStatusNotFound(t *testing.T) {
	db := setupTestDB(t)

	_, err := db.GetMemberStatus("p1", "nonexistent")
	if err == nil {
		t.Error("expected error for nonexistent member status")
	}
}

func TestRemoveAllMembers(t *testing.T) {
	db := setupTestDB(t)

	db.AddMember("p1", "client1", "Alice")
	db.AddMember("p1", "client2", "Bob")
	db.AddMember("p2", "client3", "Charlie")

	err := db.RemoveAllMembers("p1")
	if err != nil {
		t.Fatalf("RemoveAllMembers failed: %v", err)
	}

	isMember1, _ := db.IsMember("p1", "client1")
	isMember2, _ := db.IsMember("p1", "client2")
	isMember3, _ := db.IsMember("p2", "client3")

	if isMember1 || isMember2 {
		t.Error("expected p1 members to be removed")
	}
	if !isMember3 {
		t.Error("expected p2 member to remain")
	}
}

func TestListMemberIDs(t *testing.T) {
	db := setupTestDB(t)

	db.AddMember("p1", "client1", "Alice")
	db.AddMember("p1", "client2", "Bob")

	ids, err := db.ListMemberIDs("p1")
	if err != nil {
		t.Fatalf("ListMemberIDs failed: %v", err)
	}
	if len(ids) != 2 {
		t.Fatalf("expected 2 member IDs, got %d", len(ids))
	}
}

func TestListMemberIDsEmpty(t *testing.T) {
	db := setupTestDB(t)

	ids, err := db.ListMemberIDs("empty-project")
	if err != nil {
		t.Fatalf("ListMemberIDs failed: %v", err)
	}
	if len(ids) != 0 {
		t.Errorf("expected empty list, got %d", len(ids))
	}
}

func TestSetMemberOnline(t *testing.T) {
	db := setupTestDB(t)

	db.AddMember("p1", "client1", "Alice")
	err := db.SetMemberOnline("p1", "client1", true)
	if err != nil {
		t.Fatalf("SetMemberOnline failed: %v", err)
	}

	members, _ := db.ListMembers("p1")
	if len(members) != 1 {
		t.Fatalf("expected 1 member, got %d", len(members))
	}
	if !members[0].Online {
		t.Error("expected member to be online")
	}
}

func TestListMembers(t *testing.T) {
	db := setupTestDB(t)

	db.AddMember("p1", "client1", "Alice")
	db.AddMember("p1", "client2", "Bob")

	members, err := db.ListMembers("p1")
	if err != nil {
		t.Fatalf("ListMembers failed: %v", err)
	}
	if len(members) != 2 {
		t.Fatalf("expected 2 members, got %d", len(members))
	}
}

func TestIsDisplayNameTaken(t *testing.T) {
	db := setupTestDB(t)

	db.AddMember("p1", "client1", "Alice")

	taken, err := db.IsDisplayNameTaken("p1", "Alice")
	if err != nil {
		t.Fatalf("IsDisplayNameTaken failed: %v", err)
	}
	if !taken {
		t.Error("expected 'Alice' to be taken")
	}

	notTaken, err := db.IsDisplayNameTaken("p1", "Eve")
	if err != nil {
		t.Fatalf("IsDisplayNameTaken failed: %v", err)
	}
	if notTaken {
		t.Error("expected 'Eve' to not be taken")
	}
}

func TestAddPending(t *testing.T) {
	db := setupTestDB(t)

	err := db.AddPending("p1", "client1", "Alice")
	if err != nil {
		t.Fatalf("AddPending failed: %v", err)
	}

	isPending, err := db.IsPending("p1", "client1")
	if err != nil {
		t.Fatalf("IsPending failed: %v", err)
	}
	if !isPending {
		t.Error("expected client1 to be pending")
	}
}

func TestRemovePending(t *testing.T) {
	db := setupTestDB(t)

	db.AddPending("p1", "client1", "Alice")
	err := db.RemovePending("p1", "client1")
	if err != nil {
		t.Fatalf("RemovePending failed: %v", err)
	}

	isPending, _ := db.IsPending("p1", "client1")
	if isPending {
		t.Error("expected client1 to not be pending after removal")
	}
}

func TestListPending(t *testing.T) {
	db := setupTestDB(t)

	db.AddPending("p1", "client1", "Alice")
	db.AddPending("p1", "client2", "Bob")
	db.AddPending("p2", "client3", "Charlie")

	pending, err := db.ListPending("p1")
	if err != nil {
		t.Fatalf("ListPending failed: %v", err)
	}
	if len(pending) != 2 {
		t.Fatalf("expected 2 pending, got %d", len(pending))
	}
}

func TestAddRejected(t *testing.T) {
	db := setupTestDB(t)

	err := db.AddRejected("p1", "client1")
	if err != nil {
		t.Fatalf("AddRejected failed: %v", err)
	}

	isRejected, err := db.IsRejected("p1", "client1")
	if err != nil {
		t.Fatalf("IsRejected failed: %v", err)
	}
	if !isRejected {
		t.Error("expected client1 to be rejected")
	}
}

func TestRemoveRejected(t *testing.T) {
	db := setupTestDB(t)

	db.AddRejected("p1", "client1")
	err := db.RemoveRejected("p1", "client1")
	if err != nil {
		t.Fatalf("RemoveRejected failed: %v", err)
	}

	isRejected, _ := db.IsRejected("p1", "client1")
	if isRejected {
		t.Error("expected client1 to not be rejected after removal")
	}
}
