// Test-only ACL fixture. Never apply to an existing user workspace.
async function powershell(root: string, script: string, sddl = ""): Promise<string> {
  const child = Bun.spawn(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script], {
    env: { ...process.env, BB_ACL_ROOT: root, BB_ACL_SDDL: sddl },
    stdout: "pipe", stderr: "pipe",
  });
  const [out, error, code] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ]);
  if (code !== 0) throw new Error(`ACL fixture failed (${code}): ${error}`);
  return out.trim();
}

/** Deny writes on this disposable directory only; retain read/delete/ACL rights. */
export async function denyWindowsWrites(root: string): Promise<() => Promise<void>> {
  const original = await powershell(root, `
    $ErrorActionPreference = 'Stop'
    ([IO.Directory]::GetAccessControl($env:BB_ACL_ROOT)).Sddl
  `);
  const restore = async () => {
    await powershell(root, `
      $ErrorActionPreference = 'Stop'
      $acl = [IO.Directory]::GetAccessControl($env:BB_ACL_ROOT)
      $acl.SetSecurityDescriptorSddlForm($env:BB_ACL_SDDL, [Security.AccessControl.AccessControlSections]::Access)
      [IO.Directory]::SetAccessControl($env:BB_ACL_ROOT, $acl)
    `, original);
  };
  try {
    await powershell(root, `
      $ErrorActionPreference = 'Stop'
      $acl = [IO.Directory]::GetAccessControl($env:BB_ACL_ROOT)
      $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
      $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, [Security.AccessControl.FileSystemRights]::Write, [Security.AccessControl.AccessControlType]::Deny)
      $acl.AddAccessRule($rule)
      [IO.Directory]::SetAccessControl($env:BB_ACL_ROOT, $acl)
    `);
  } catch (error) { await restore(); throw error; }
  return restore;
}
