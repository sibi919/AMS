-- Provision accounts when trusted app metadata becomes available.
-- Keep the existing provisioning function and security checks unchanged.

DROP TRIGGER IF EXISTS academy_user_created ON auth.users;

CREATE TRIGGER academy_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
WHEN (NEW.raw_app_meta_data ? 'academy_role')
EXECUTE FUNCTION public.provision_academy_profile();

CREATE TRIGGER academy_user_metadata_ready
AFTER UPDATE OF raw_app_meta_data ON auth.users
FOR EACH ROW
WHEN (
  NEW.raw_app_meta_data ? 'academy_role'
  AND NOT (
    COALESCE(OLD.raw_app_meta_data, '{}'::jsonb) ? 'academy_role'
  )
)
EXECUTE FUNCTION public.provision_academy_profile();