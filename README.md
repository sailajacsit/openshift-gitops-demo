OpenShift GitOps Demo — GitOps-based deployment with OpenShift GitOps & Argo CD
A working, multi-environment GitOps setup on Red Hat OpenShift. 

Technologies: Red Hat OpenShift · OpenShift GitOps · Argo CD · Git · Kubernetes YAML · Kustomize · RBAC (ServiceAccounts, Roles, RoleBindings) · CI/CD

1. What this project demonstrates
Goal	How it is met
Declarative deployments	Every manifest (Deployment, Service, Route, ConfigMap, RBAC, Argo CD apps) is versioned here — no oc create run / console clicks
Multi-environment releases	One base/ + Kustomize overlays/ for dev, test, prod; a release moves by editing Git, not the cluster
Continuous reconciliation	Argo CD polls the repo (webhook optional) and applies new commits automatically in dev/test
Drift detection	A manual oc scale makes the app OutOfSync; dev self-heals in seconds, prod waits for approval
Traceability & rollback	Every change is a commit; roll back with git revert or argocd app rollback
Least privilege	Role/RoleBinding/ServiceAccount grant read-and-debug only; the controller gets admin only inside managed namespaces
2. Architecture
  Developer ──commit──▶  Git repo (main / release)
      │                     │
      │  CI: build image    │  watch (poll / webhook)
      ▼                     ▼
  quay.io image  ◀────  OpenShift GitOps (Argo CD)
                            │  compare desired vs live
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
      web-app-dev      web-app-test     web-app-prod
      auto-sync        auto-sync        manual sync
      selfHeal         selfHeal         drift → OutOfSync
Flow: CI builds and pushes the image, then bumps the image tag in Git. Argo CD does the deploy. CI never talks to the cluster.

4. Repository layout
openshift-gitops-demo/
├── apps/web-app/
│   ├── base/                      # shared, environment-independent manifests
│   │   ├── kustomization.yaml
│   │   ├── deployment.yaml        # image, probes, resources, serviceAccountName
│   │   ├── service.yaml
│   │   ├── route.yaml             # edge TLS, HTTP → HTTPS redirect
│   │   └── configmap.yaml
│   └── overlays/                  # per-environment differences only
│       ├── dev/    (kustomization.yaml, patch-replicas.yaml)
│       ├── test/   (kustomization.yaml, patch-replicas.yaml)
│       └── prod/   (kustomization.yaml, patch-replicas.yaml)
├── rbac/                          # ServiceAccount, Role, RoleBinding (+ kustomization)
├── argocd/                        # AppProject, app-dev/test/prod, controller RoleBinding
├── src/                           # sample app: server.js, package.json, Containerfile
├── .github/workflows/ci.yaml      # build → push → bump image tag in Git
├── commands.sh                    # all 10 executable steps, in order
└── README.md

Step 1 — Install the OpenShift GitOps operator
oc login --token=<TOKEN> --server=https://api.<cluster>:6443

cat <<EOF | oc apply -f -
apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata:
  name: openshift-gitops-operator
  namespace: openshift-operators
spec:
  channel: latest
  name: openshift-gitops-operator
  source: redhat-operators
  sourceNamespace: openshift-marketplace
EOF

oc get pods -n openshift-gitops -w
Step 2 — Log in to Argo CD
ARGO_URL=$(oc get route openshift-gitops-server -n openshift-gitops -o jsonpath='{.spec.host}')
ARGO_PWD=$(oc get secret openshift-gitops-cluster -n openshift-gitops -o jsonpath='{.data.admin\.password}' | base64 -d)
argocd login $ARGO_URL --username admin --password $ARGO_PWD --insecure

Step 3 — Create namespaces and hand them to GitOps

for env in dev test prod; do
  oc new-project web-app-$env
  oc label namespace web-app-$env argocd.argoproj.io/managed-by=openshift-gitops
done
Step 4 — Validate manifests before committing
oc kustomize apps/web-app/overlays/dev
oc kustomize apps/web-app/overlays/prod | oc apply --dry-run=server -f -
Step 5 — Register the AppProject and the three Applications
oc apply -f argocd/appproject.yaml
oc apply -f argocd/rolebinding-argocd.yaml
oc apply -f argocd/app-dev.yaml -f argocd/app-test.yaml -f argocd/app-prod.yaml

argocd app list
argocd app get web-app-dev
Step 6 — Deploy a change through Git
cd apps/web-app/overlays/test
kustomize edit set image quay.io/sailaja/web-app:1.1.0
git commit -am "test: promote web-app 1.1.0"
git push origin main

argocd app wait web-app-test --health --sync --timeout 300
Step 7 — Promote to production (manual sync)
git checkout release && git merge main && git push origin release
argocd app diff web-app-prod
argocd app sync web-app-prod
oc get pods,route -n web-app-prod

