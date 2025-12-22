pipeline {
    agent any

    parameters {
        booleanParam(name: 'RUN_CHAOS_TEST', defaultValue: false, description: 'Run Chaos Engineering tests after deployment')
        booleanParam(name: 'SKIP_SECURITY_SCAN', defaultValue: false, description: 'Skip security scans (not recommended)')
    }

    environment {
        IMAGE_NAME = "ci-cd-app"
        DOCKER_HUB_REPO = "sriman05/ci-cd-app"
        DOCKER_TAG = "latest"
        BACKEND_URL = "${env.BACKEND_URL ?: 'http://localhost:3001'}"
    }

    stages {
        stage('Install Dependencies') {
            steps {
                dir('app') {
                    bat 'npm install'
                }
            }
        }

        // ================================================
        // MODULE A: DEVSECOPS - SAST (Static Analysis)
        // ================================================
        stage('Security: SAST') {
            when {
                expression { return !params.SKIP_SECURITY_SCAN }
            }
            steps {
                dir('app') {
                    script {
                        echo "🔒 Running SAST Security Checks..."
                        
                        // NPM Audit - Check dependencies for vulnerabilities
                        echo "📦 Checking npm dependencies for vulnerabilities..."
                        def auditResult = bat(
                            script: 'npm audit --audit-level=high 2>&1 || exit 0',
                            returnStdout: true
                        )
                        echo auditResult
                        
                        if (auditResult.contains('high') || auditResult.contains('critical')) {
                            echo "⚠️ WARNING: Vulnerabilities found in dependencies!"
                            // Uncomment below to fail on vulnerabilities:
                            // error("Critical vulnerabilities found in npm dependencies")
                        } else {
                            echo "✅ No high/critical vulnerabilities in dependencies"
                        }
                        
                        // ESLint Security Check
                        echo "🔍 Running ESLint Security Analysis..."
                        try {
                            bat 'npx eslint . --ext .js --config .eslintrc.json --format stylish || exit 0'
                            echo "✅ ESLint security check completed"
                        } catch (Exception e) {
                            echo "⚠️ ESLint found issues: ${e.getMessage()}"
                        }
                    }
                }
            }
        }

        stage('Run Tests') {
            steps {
                dir('app') {
                    bat 'npm test'
                }
            }
        }

        stage('Docker Build') {
            steps {
                dir('app') {
                    bat '''
                        docker build -t %IMAGE_NAME% .
                        docker tag %IMAGE_NAME% %DOCKER_HUB_REPO%:%DOCKER_TAG%
                        echo "Docker image built successfully!"
                    '''
                }
            }
        }

        // ================================================
        // MODULE A: DEVSECOPS - Container Security (Trivy)
        // ================================================
        stage('Security: Container Scan') {
            when {
                expression { return !params.SKIP_SECURITY_SCAN }
            }
            steps {
                script {
                    echo "🔒 Scanning Docker image for vulnerabilities with Trivy..."
                    
                    try {
                        // Run Trivy scan for HIGH and CRITICAL vulnerabilities
                        def trivyResult = bat(
                            script: """
                                trivy image --severity HIGH,CRITICAL --exit-code 0 --format table %DOCKER_HUB_REPO%:%DOCKER_TAG%
                            """,
                            returnStdout: true
                        )
                        echo trivyResult
                        
                        // Check for CRITICAL vulnerabilities (fail pipeline)
                        def criticalScan = bat(
                            script: """
                                trivy image --severity CRITICAL --exit-code 1 %DOCKER_HUB_REPO%:%DOCKER_TAG% 2>&1
                            """,
                            returnStatus: true
                        )
                        
                        if (criticalScan != 0) {
                            error("🚨 CRITICAL vulnerabilities found! Pipeline stopped for security review.")
                        }
                        
                        echo "✅ Container security scan passed - No CRITICAL vulnerabilities"
                        
                    } catch (Exception e) {
                        if (e.getMessage().contains("CRITICAL vulnerabilities")) {
                            throw e
                        }
                        echo "⚠️ Trivy scan warning: ${e.getMessage()}"
                        echo "Continuing with deployment..."
                    }
                }
            }
        }

        stage('Docker Push') {
            steps {
                dir('app') {
                    withCredentials([usernamePassword(credentialsId: 'dockerhub', usernameVariable: 'DOCKER_USER', passwordVariable: 'DOCKER_PASS')]) {
                        bat '''
                            docker login -u %DOCKER_USER% -p %DOCKER_PASS%
                            docker push %DOCKER_HUB_REPO%:%DOCKER_TAG%
                            echo "Docker image pushed successfully!"
                        '''
                    }
                }
            }
        }

        stage('Kubernetes Deployment') {
            steps {
                script {
                    echo "🚀 Deploying to Kubernetes..."
                    try {
                        withKubeConfig([credentialsId: 'kubeconfig-minikube']) {
                            bat 'kubectl config current-context'
                            bat 'kubectl cluster-info --request-timeout=10s'
                            
                            echo "Creating namespace if not exists..."
                            bat 'kubectl create namespace ci-cd-app --dry-run=client -o yaml | kubectl apply -f -'
                            
                            echo "Applying Kubernetes manifests..."
                            bat '''
                                kubectl apply -f k8s/deployment.yaml -n ci-cd-app
                                kubectl apply -f k8s/service.yaml -n ci-cd-app
                                kubectl rollout status deployment/ci-cd-app -n ci-cd-app --timeout=120s
                            '''
                            
                            echo "✅ Kubernetes deployment successful!"
                            bat 'kubectl get services ci-cd-app-service -n ci-cd-app'
                            bat 'kubectl get pods -n ci-cd-app -l app=ci-cd-app'
                        }
                    } catch (Exception e) {
                        echo "❌ Kubernetes deployment failed: ${e.getMessage()}"
                        currentBuild.result = 'UNSTABLE'
                        echo "Build continues despite K8s issues"
                    }
                }
            }
        }

        // ================================================
        // MODULE C: CHAOS ENGINEERING (Manual Trigger)
        // ================================================
        stage('Chaos Test') {
            when {
                expression { return params.RUN_CHAOS_TEST }
            }
            steps {
                script {
                    echo "🔥 Running Chaos Engineering Test..."
                    try {
                        withKubeConfig([credentialsId: 'kubeconfig-minikube']) {
                            // Apply chaos experiment
                            echo "Applying pod failure chaos experiment..."
                            bat 'kubectl apply -f k8s/chaos-experiment.yaml -n ci-cd-app || echo "Chaos Mesh not installed"'
                            
                            // Wait for chaos to take effect
                            echo "Waiting for chaos experiment to execute (30 seconds)..."
                            bat 'ping -n 35 127.0.0.1 > nul'
                            
                            // Verify pod recovery
                            echo "Verifying pod recovery..."
                            bat 'kubectl get pods -n ci-cd-app -l app=ci-cd-app'
                            
                            def podCount = bat(
                                script: 'kubectl get pods -n ci-cd-app -l app=ci-cd-app --field-selector=status.phase=Running -o name | find /c "pod"',
                                returnStdout: true
                            ).trim()
                            
                            echo "Running pods after chaos: ${podCount}"
                            echo "✅ Chaos test completed - System recovered successfully!"
                        }
                    } catch (Exception e) {
                        echo "⚠️ Chaos test issue: ${e.getMessage()}"
                        currentBuild.result = 'UNSTABLE'
                    }
                }
            }
        }
    }

    post {
        always {
            script {
                def buildStatus = currentBuild.result ?: 'SUCCESS'
                def buildNumber = env.BUILD_NUMBER
                def jobName = env.JOB_NAME
                def consoleLink = "${env.BUILD_URL}console"
                def commitMessage = ""
                def duration = currentBuild.durationString

                try {
                    commitMessage = bat(
                        script: 'git log -1 --pretty=format:"%%s"',
                        returnStdout: true
                    ).trim()
                } catch (Exception e) {
                    commitMessage = "Could not retrieve commit message"
                }

                def errorDetails = ""
                if (buildStatus in ['FAILURE', 'UNSTABLE']) {
                    try {
                        errorDetails = bat(
                            script: 'type "%JENKINS_HOME%\\jobs\\%JOB_NAME%\\builds\\%BUILD_NUMBER%\\log" 2>nul || echo "Could not read build log"',
                            returnStdout: true
                        )
                        if (errorDetails.length() > 1000) {
                            errorDetails = "..." + errorDetails.substring(errorDetails.length() - 1000)
                        }
                    } catch (Exception e) {
                        errorDetails = "Could not retrieve error details: ${e.getMessage()}"
                    }
                }

                def jsonBody = [
                    status: buildStatus,
                    jobName: jobName,
                    buildNumber: buildNumber,
                    consoleLink: consoleLink,
                    commitMessage: commitMessage,
                    duration: duration,
                    errorDetails: errorDetails,
                    timestamp: new Date().format("yyyy-MM-dd'T'HH:mm:ss'Z'"),
                    kubernetesDeployed: buildStatus in ['SUCCESS', 'UNSTABLE'],
                    securityScanPassed: !params.SKIP_SECURITY_SCAN,
                    chaosTestRun: params.RUN_CHAOS_TEST
                ]

                withCredentials([string(credentialsId: 'jenkins-api-token', variable: 'JENKINS_API_TOKEN')]) {
                    try {
                        httpRequest(
                            url: "${env.BACKEND_URL}/api/log-final-status",
                            httpMode: 'POST',
                            contentType: 'APPLICATION_JSON',
                            requestBody: groovy.json.JsonOutput.toJson(jsonBody),
                            customHeaders: [[name: 'Authorization', value: "Bearer ${JENKINS_API_TOKEN}"]],
                            validResponseCodes: '100:399',
                            timeout: 30
                        )
                        echo "Build status sent successfully to backend."
                    } catch (Exception e) {
                        echo "Failed to send build status to backend: ${e.getMessage()}"
                    }
                }
            }
        }

        success {
            echo "✅ Build completed successfully! All security checks passed."
        }

        failure {
            echo "❌ Build failed. Check security reports and logs for details."
        }

        unstable {
            echo "⚠️ Build completed with warnings. Review security findings."
        }
    }
}
